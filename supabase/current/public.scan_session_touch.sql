CREATE OR REPLACE FUNCTION public.scan_session_touch(p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if not exists (select 1 from devices where id = p_device) then
    raise exception 'no_device';
  end if;
  delete from scan_sessions where heartbeat_at < now() - interval '1 day';

  insert into scan_sessions as s (device_id, target_kind, buy_id, target_name, games, staff_user_id, locked, heartbeat_at)
  values (p_device, p_kind, p_buy_id, coalesce(p_name, ''), coalesce(p_games, '{}'), p_user,
          nullif(btrim(p_locked), ''), now())
  on conflict (device_id) do update
     set target_kind = excluded.target_kind,
         buy_id = excluded.buy_id,
         target_name = excluded.target_name,
         games = excluded.games,
         staff_user_id = excluded.staff_user_id,
         locked = excluded.locked,
         heartbeat_at = now(),
         phone_device_id = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_device_id end,
         paired_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.paired_at end,
         phone_seen_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_seen_at end;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
