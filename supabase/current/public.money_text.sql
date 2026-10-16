CREATE OR REPLACE FUNCTION public.money_text(p numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case when p is null then null
              when p = trunc(p) then '$' || to_char(p, 'FM999,999,990')
              else '$' || to_char(p, 'FM999,999,990.00') end
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
