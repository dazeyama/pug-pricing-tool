-- One walk-in buy, from the ⋯ menu on its day page (owner, 2026-10-02):
-- Mark as completed, and Convert to project.

-- ---------------------------------------------------------------------------
-- buy_mark_completed: p_complete true marks this game's Paid/Ours cards in
-- one buy Completed without exporting them: locked, left out of the header
-- search, and left out of the day's export (export_lines only takes cards not
-- yet Completed). p_complete false puts back only cards marked this way (no
-- export stamps); exported cards go back with their day (export_undo_day).
-- Returns how many cards changed.
-- ---------------------------------------------------------------------------
create or replace function public.buy_mark_completed(
  p_buy_id           uuid,
  p_game             text,
  p_user             uuid,
  p_device           uuid,
  p_complete         boolean,
  p_expected_version integer default null
) returns integer
language plpgsql
set search_path = public
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
    update buy_lines set completed_at = null, completed_by = null
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
revoke execute on function public.buy_mark_completed(uuid, text, uuid, uuid, boolean, integer) from public, anon;
grant execute on function public.buy_mark_completed(uuid, text, uuid, uuid, boolean, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- buy_to_project: Convert to project. A new project (Paid/Ours, like
-- project_create) gets every card of the buy, both games, exactly as they
-- were (prices, conditions, versions), and the buy's notes, rates and what
-- was paid; then the buy is deleted. Not for a buy with Completed cards (like
-- buy_delete). Returns the project's ID.
-- ---------------------------------------------------------------------------
create or replace function public.buy_to_project(
  p_buy_id           uuid,
  p_name             text,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer default null,
  p_line_texts       jsonb default '{}'
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  b        buys;
  p        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = b.id group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id;

  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, null, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.paid_price, b.paid_method, p_user, p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_converted', v_target, coalesce(v_games, '{}'),
    coalesce(v_count, 0), coalesce(v_market, 0),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '-')), '[]'::jsonb) from jsonb_array_elements(v_lines) x),
    sentence(format('Converted to project %s with %s card%s', v_name, coalesce(v_count, 0),
                    case when coalesce(v_count, 0) = 1 then '' else 's' end)));
  perform collection_event(p, p_user, p_device, 'collection_created', coalesce(v_games, '{}'),
    coalesce(v_count, 0), 0, null,
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)));

  delete from buys where id = b.id;
  return p.id;
end;
$$;
revoke execute on function public.buy_to_project(uuid, text, uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.buy_to_project(uuid, text, uuid, uuid, integer, jsonb) to authenticated;
