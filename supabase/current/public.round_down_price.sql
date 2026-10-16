CREATE OR REPLACE FUNCTION public.round_down_price(p numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select (floor(c / s) * s) / 100
  from (select floor(round(p * 100, 6)) as c) x,
       lateral (select case when x.c >= 100000 then 1000 when x.c >= 10000 then 500
                            when x.c >= 1000 then 100 when x.c >= 100 then 25 else 1 end as s) y
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
