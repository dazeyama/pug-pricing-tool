CREATE OR REPLACE FUNCTION internal.collection_sku(p_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_day date := (p_at at time zone 'America/Los_Angeles')::date;
  v_n   integer;
begin
  insert into internal.collection_sku_days (day, last_number) values (v_day, 1)
  on conflict (day) do update set last_number = collection_sku_days.last_number + 1
  returning last_number into v_n;
  return internal.cc_custom_sku_day(v_day) || '-' || v_n;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
