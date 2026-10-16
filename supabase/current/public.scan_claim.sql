CREATE OR REPLACE FUNCTION public.scan_claim(p_id uuid, p_device uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v jsonb;
begin
  update scans set status = 'pricing', handled_at = now()
   where id = p_id and session_device_id = p_device
     and (status = 'sent' or (status = 'pricing' and handled_at < now() - interval '1 minute'))
  returning to_jsonb(scans.*) into v;
  return v;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
