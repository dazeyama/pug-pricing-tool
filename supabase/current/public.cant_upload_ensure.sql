CREATE OR REPLACE FUNCTION public.cant_upload_ensure()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from buys where system_key = 'cant_upload';
  if v_id is null then
    insert into buys (kind, status, customer_name, phone, notes, system_key, paid_at)
    values ('collection', 'paid', 'Can''t upload cards', null, cant_upload_note(), 'cant_upload', now())
    on conflict (system_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buys where system_key = 'cant_upload';
    end if;
  end if;
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
