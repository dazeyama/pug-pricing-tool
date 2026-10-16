CREATE OR REPLACE FUNCTION public.scan_pair(p_device uuid, p_phone uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scan_sessions;
begin
  if p_phone is null or p_phone = p_device or not exists (select 1 from devices where id = p_phone) then
    raise exception 'not_a_device';
  end if;
  select * into v from scan_sessions where device_id = p_device for update;
  if not found then
    raise exception 'session_gone';
  end if;
  if v.heartbeat_at < now() - interval '60 seconds' then
    raise exception 'session_stale';
  end if;
  if v.locked is not null or not ('mtg' = any (v.games)) then
    raise exception 'cannot_scan';
  end if;

  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where phone_device_id = p_phone and device_id <> p_device;
  update scan_sessions
     set phone_device_id = p_phone,
         paired_at = case when phone_device_id = p_phone then paired_at else now() end,
         scanned = case when phone_device_id = p_phone then scanned else 0 end,
         phone_seen_at = now()
   where device_id = p_device;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
