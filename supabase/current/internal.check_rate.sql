CREATE OR REPLACE FUNCTION internal.check_rate(p numeric)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if p is not null and (p < 0 or p > 100 or p <> round(p, 2)) then
    raise exception 'bad_pct';
  end if;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
