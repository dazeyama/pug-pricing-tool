-- Exporting the current day is refused (owner, 2026-09-30): buys confirmed
-- after the export would be left Paid/Ours beside Completed ones. Since a buy
-- is always confirmed on the current day, a past day can't gain buys, so an
-- export is always the whole day. day_mark (0018) with that check added.

create or replace function public.day_mark(
  p_day      date,
  p_game     text,
  p_user     uuid,
  p_device   uuid,
  p_complete boolean
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  -- The day isn't over: buys confirmed later would miss the export (owner,
  -- 2026-09-30). Putting a day back to Paid/Ours is always allowed.
  if p_complete and p_day >= (now() at time zone 'America/Los_Angeles')::date then
    raise exception 'day_not_over';
  end if;

  select array_agg(distinct b.id) into v_ids
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game
     and (l.completed_at is null) = p_complete;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  if p_complete then
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = any(v_ids) and game = p_game and completed_at is null;
  else
    update buy_lines set completed_at = null, completed_by = null
     where buy_id = any(v_ids) and game = p_game and completed_at is not null;
  end if;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy',
          case when p_complete then 'day_exported' else 'day_unexported' end,
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status',
            'before', case when p_complete then 'Paid/Ours' else 'Completed' end,
            'after', case when p_complete then 'Completed' else 'Paid/Ours' end)),
          case when p_complete
               then format('%s %s buy%s exported and marked Completed.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end)
               else format('%s %s buy%s marked Paid/Ours again.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end) end);
  return v_count;
end;
$$;
