CREATE OR REPLACE FUNCTION public.scan_undo(p_id uuid, p_phone uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.phone_device_id <> p_phone then
    raise exception 'not_phone';
  end if;
  if v.status <> 'added' then
    raise exception 'not_added';
  end if;
  update scans set status = 'undo', note = null, handled_at = now() where id = p_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
