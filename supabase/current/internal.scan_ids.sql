CREATE OR REPLACE FUNCTION internal.scan_ids(p_snapshot jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
    from (select p_snapshot -> 'scan' ->> 'scan_id' as x
          union all
          select jsonb_array_elements_text(case when jsonb_typeof(p_snapshot -> 'scans') = 'array'
                                                then p_snapshot -> 'scans' else '[]'::jsonb end)) t
   where x is not null;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
