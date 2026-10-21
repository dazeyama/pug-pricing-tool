CREATE OR REPLACE FUNCTION public.pulled_ensure()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from buys where system_key = 'pulled';
  if v_id is null then
    insert into buys (kind, status, customer_name, phone, notes, system_key, paid_at)
    values ('collection', 'paid', 'Bulk pulled from exports', null,
            'Cards under $1 pulled out of an Export MTG csv (>$1) batch. They stay here until they''re exported '
            || 'from here or deleted.', 'pulled', now())
    on conflict (system_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buys where system_key = 'pulled';
    end if;
  end if;
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
