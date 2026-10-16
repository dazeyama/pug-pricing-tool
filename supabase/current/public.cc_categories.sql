CREATE OR REPLACE FUNCTION public.cc_categories()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(array_agg(distinct category order by category), '{}')
    from cc_products where file_id = cc_current_file()
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
