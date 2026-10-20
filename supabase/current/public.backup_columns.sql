CREATE OR REPLACE FUNCTION public.backup_columns()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
  select coalesce(jsonb_object_agg(table_name, cols), '{}'::jsonb)
    from (select table_name::text, jsonb_agg(column_name::text order by ordinal_position) as cols
            from information_schema.columns
           where table_schema = 'public'
             and table_name in ('staff_users', 'devices', 'buys', 'buy_lines', 'events', 'settings',
                                'cc_set_map', 'cc_product_links', 'import_links')
           group by table_name) t;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
