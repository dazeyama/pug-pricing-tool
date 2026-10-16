CREATE OR REPLACE FUNCTION public.backup_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
    'buys',        (select count(*) from buys where kind = 'walk_in' and status = 'confirmed'),
    'collections', (select count(*) from buys where kind = 'collection'),
    'lines',       (select count(*) from buy_lines),
    'events',      (select count(*) from events),
    'users',       (select count(*) from staff_users where active))
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
