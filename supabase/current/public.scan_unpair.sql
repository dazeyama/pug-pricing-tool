CREATE OR REPLACE FUNCTION public.scan_unpair(p_device uuid, p_phone uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if not exists (select 1 from scan_sessions where device_id = p_device) then
    raise exception 'session_gone';
  end if;
  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where device_id = p_device and (p_phone is null or phone_device_id = p_phone);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
