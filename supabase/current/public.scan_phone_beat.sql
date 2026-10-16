CREATE OR REPLACE FUNCTION public.scan_phone_beat(p_device uuid, p_phone uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  update scan_sessions set phone_seen_at = now()
   where device_id = p_device and phone_device_id = p_phone
     and heartbeat_at >= now() - interval '60 seconds';
  return found;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
