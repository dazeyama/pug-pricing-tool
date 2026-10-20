-- COMPLETE on a Pokémon day page also works out today's Sell Prices, as the
-- export does, and keeps them on the cards (owner, 2026-10-09): the day page
-- shows them in green. day_complete (0038) takes them as p_prices; called
-- without (the older live build), it completes as before. A buy put back to
-- Paid/Ours on its own (buy_mark_completed, 0036) loses them again; the
-- day's export_undo_day already clears them.

drop function public.day_complete(date, text, uuid, uuid);

create or replace function public.day_complete(
  p_day    date,
  p_game   text,
  p_user   uuid,
  p_device uuid,
  p_prices jsonb default null
) returns integer
language plpgsql
set search_path = public, internal
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_cards integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  -- The day isn't over: buys confirmed later would be missed.
  if p_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;

  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
   for update;
  select array_agg(distinct b.id), coalesce(sum(l.quantity), 0) into v_ids, v_cards
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  -- Today's Sell Prices for the cards completed (owner, 2026-10-09), worked
  -- out in the app as the export does (sellPrice.js): shown in green on the
  -- day page. Only for cards this completes; none given, none kept.
  if p_prices is not null and jsonb_typeof(p_prices) = 'array' then
    if exists (select 1 from jsonb_array_elements(p_prices) e
                where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0) then
      raise exception 'bad_price';
    end if;
    update buy_lines l
       set cc_sell_price = (e ->> 'sell_price')::numeric, cc_sell_basis = e -> 'sell_basis'
      from jsonb_array_elements(p_prices) e
     where l.id = (e ->> 'line_id')::uuid
       and l.buy_id = any(v_ids) and l.game = p_game and l.completed_at is null;
  end if;
  update buy_lines set completed_at = now(), completed_by = p_user
   where buy_id = any(v_ids) and game = p_game and completed_at is null;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_completed',
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
          format('%s %s buy%s (%s card%s) marked Completed, not exported.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end, v_cards,
                 case when v_cards = 1 then '' else 's' end));
  return v_count;
end;
$$;
revoke execute on function public.day_complete(date, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.day_complete(date, text, uuid, uuid, jsonb) to authenticated;

create or replace function public.buy_mark_completed(
  p_buy_id           uuid,
  p_game             text,
  p_user             uuid,
  p_device           uuid,
  p_complete         boolean,
  p_expected_version integer default null
) returns integer
language plpgsql
set search_path = public, internal
as $$
declare
  b        buys;
  v_count  integer;
  v_cards  integer;
  v_market numeric;
  v_game   text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if v_game is null then
    raise exception 'bad_game';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  if p_complete then
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = b.id and game = p_game and completed_at is null;
  else
    -- COMPLETE's Sell Prices go with it (owner, 2026-10-09).
    update buy_lines set completed_at = null, completed_by = null, cc_sell_price = null, cc_sell_basis = null
     where buy_id = b.id and game = p_game and completed_at is not null and cc_status is null;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select sum(quantity), sum(unit_price * quantity) into v_cards, v_market
    from buy_lines where buy_id = b.id and game = p_game;
  perform buy_event(b, p_user, p_device,
    case when p_complete then 'buy_completed' else 'buy_uncompleted' end,
    buy_target_name(b.id), array[p_game], 0, coalesce(v_market, 0), '[]'::jsonb,
    case when p_complete
         then format('%s %s card%s marked Completed without exporting: left out of the search and the day''s export.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end)
         else format('%s %s card%s marked Paid/Ours again.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end) end);
  return v_count;
end;
$$;
