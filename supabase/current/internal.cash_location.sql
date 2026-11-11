CREATE OR REPLACE FUNCTION internal.cash_location(p_location text, p_method text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v text := lower(nullif(btrim(coalesce(p_location, '')), ''));
begin
  if p_method is distinct from 'cash' then
    return null;
  end if;
  if v is not null and v not in ('till', 'backroom') then
    raise exception 'bad_cash_location';
  end if;
  return v;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
