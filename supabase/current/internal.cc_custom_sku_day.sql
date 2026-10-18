CREATE OR REPLACE FUNCTION internal.cc_custom_sku_day(p_day date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select to_char(p_day, 'FMMMDDYY');
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
