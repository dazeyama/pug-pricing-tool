CREATE OR REPLACE FUNCTION internal.cc_custom_sku(p_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select to_char(p_at at time zone 'America/Los_Angeles', 'FMMMDDYY');
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
