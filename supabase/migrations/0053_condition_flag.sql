-- 🚩 Flag check for condition (owner, 2026-10-14): CONFIRM BUY can flag a buy
-- whose cards need their condition checked before it's exported; the day
-- page shows the flag and warns, and its ⋯ clears it (Condition checked) or
-- sets it later. A flag isn't the buy's content: it doesn't bump the buy's
-- version (an export open meanwhile isn't made stale by it), and it can
-- change on a Completed buy too.

alter table public.buys add column condition_check boolean not null default false;

create function public.buy_set_condition_check(
  p_buy_id uuid,
  p_flag   boolean,
  p_user   uuid,
  p_device uuid
) returns boolean            -- the flag as it now is
language plpgsql
set search_path = public, internal
as $$
declare
  b        buys;
  v_flag   boolean := coalesce(p_flag, false);
  v_games  text[];
  v_market numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if b.condition_check = v_flag then
    return v_flag;   -- as it was: nothing to log
  end if;
  update buys set condition_check = v_flag, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select array(select distinct game from buy_lines where buy_id = b.id order by 1),
         coalesce(sum(unit_price * quantity), 0)
    into v_games, v_market
    from buy_lines where buy_id = b.id;
  perform buy_event(b, p_user, p_device,
    case when v_flag then 'buy_flagged' else 'buy_flag_cleared' end,
    buy_target_name(b.id), v_games, 0, v_market, '[]'::jsonb,
    case when v_flag then 'Flagged: its cards need their condition checked before export.'
         else 'Condition checked: the flag is off.' end);
  return v_flag;
end;
$$;
revoke execute on function public.buy_set_condition_check(uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.buy_set_condition_check(uuid, boolean, uuid, uuid) to authenticated;
