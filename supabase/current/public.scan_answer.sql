CREATE OR REPLACE FUNCTION public.scan_answer(p_id uuid, p_phone uuid, p_price numeric)
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
  if v.status <> 'needs_price' then
    raise exception 'not_waiting';
  end if;
  if p_price is null then
    update scans set status = 'skipped', handled_at = now() where id = p_id;
    return;
  end if;
  if p_price < 0.01 or p_price > 99999999.99 or p_price <> round(p_price, 2) then
    raise exception 'bad_price';
  end if;
  update scans set status = 'sent', manual_price = p_price, handled_at = now() where id = p_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
