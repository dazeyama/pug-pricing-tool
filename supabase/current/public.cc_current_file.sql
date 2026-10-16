CREATE OR REPLACE FUNCTION public.cc_current_file()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select id from master_inventory_files where is_current limit 1
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
