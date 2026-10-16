CREATE OR REPLACE FUNCTION public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text)
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
  if v.session_device_id <> p_device then
    raise exception 'not_session';
  end if;
  if coalesce(p_status, '') not in ('added', 'needs_price', 'failed') or v.status <> 'pricing' then
    raise exception 'bad_status';
  end if;

  update scans
     set status = p_status,
         line_id = p_line_id,
         line_qty = (select quantity from buy_lines where id = p_line_id),
         price = p_price,
         price_source = p_source,
         note = p_note,
         handled_at = now()
   where id = p_id;
  if p_status = 'added' then
    update scan_sessions set scanned = scanned + 1 where device_id = p_device;
  end if;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
