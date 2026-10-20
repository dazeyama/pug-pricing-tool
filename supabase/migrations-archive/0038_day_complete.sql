-- COMPLETE on Pokémon day pages (owner, 2026-10-02): Pokémon can't be
-- exported yet, so a day's Pokémon buys are marked Completed without an
-- export, which takes them out of the header search like an exported day.

-- ---------------------------------------------------------------------------
-- day_complete: marks that game's Paid/Ours cards in the day's confirmed
-- buys Completed, with no export stamps (like buy_mark_completed, 0036, for
-- the whole day). Only a finished day, like EXPORT. Undone by the day's
-- "Mark Paid/Ours again" (export_undo_day). Returns how many buys changed.
-- ---------------------------------------------------------------------------
create or replace function public.day_complete(
  p_day    date,
  p_game   text,
  p_user   uuid,
  p_device uuid
) returns integer
language plpgsql
set search_path = public
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
revoke execute on function public.day_complete(date, text, uuid, uuid) from public, anon;
grant execute on function public.day_complete(date, text, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Calendar tells an exported day from one only marked Completed: each
-- buy also lists the games it has export-stamped cards in (0018's
-- buys_in_range plus exported_games).
-- ---------------------------------------------------------------------------
drop function public.buys_in_range(timestamptz, timestamptz);

create function public.buys_in_range(p_from timestamptz, p_to timestamptz)
returns table (id uuid, confirmed_at timestamptz, confirmed_by uuid, games text[], completed_games text[],
               exported_games text[])
language sql stable
set search_path = public
as $$
  select b.id, b.confirmed_at, b.confirmed_by,
         array(select distinct l.game from buy_lines l where l.buy_id = b.id order by 1),
         array(select l.game from buy_lines l where l.buy_id = b.id
                group by l.game having bool_and(l.completed_at is not null) order by 1),
         array(select distinct l.game from buy_lines l where l.buy_id = b.id and l.cc_status is not null order by 1)
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and b.confirmed_at >= p_from and b.confirmed_at < p_to
   order by b.confirmed_at, b.id
$$;
