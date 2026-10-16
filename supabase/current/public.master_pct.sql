CREATE OR REPLACE FUNCTION public.master_pct(p_key text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select (value #>> '{}')::numeric from settings where key = p_key
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
