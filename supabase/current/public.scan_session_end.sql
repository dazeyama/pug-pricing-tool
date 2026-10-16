CREATE OR REPLACE FUNCTION public.scan_session_end(p_device uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  delete from scan_sessions where device_id = p_device
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
