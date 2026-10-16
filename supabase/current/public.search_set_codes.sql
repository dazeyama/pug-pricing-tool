CREATE OR REPLACE FUNCTION public.search_set_codes()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(array_agg(distinct lower(set_code)), '{}') from buy_lines
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
