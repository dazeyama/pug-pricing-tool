CREATE OR REPLACE FUNCTION internal.norm_number(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select lower(regexp_replace(btrim(coalesce(p, '')), '^([a-zA-Z]*-?)0+(?=[0-9])', '\1'))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
