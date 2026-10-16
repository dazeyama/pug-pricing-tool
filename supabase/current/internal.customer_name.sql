CREATE OR REPLACE FUNCTION internal.customer_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
