CREATE OR REPLACE FUNCTION public.format_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case when p ~ '^[0-9]{10}$'
              then format('(%s) %s-%s', substr(p, 1, 3), substr(p, 4, 3), substr(p, 7, 4))
              else p end
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
