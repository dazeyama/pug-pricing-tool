CREATE OR REPLACE FUNCTION internal.rate_tiers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
           'low', '{"under": 3, "credit": 50, "cash": 25}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'low') = 'object' then s.v -> 'low' end, '{}'::jsonb),
           'high', '{"over": 35, "credit": 70, "cash": 40}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'high') = 'object' then s.v -> 'high' end, '{}'::jsonb))
  from (select (select value from settings where key = 'rate_tiers') as v) s
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
