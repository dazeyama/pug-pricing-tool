CREATE OR REPLACE FUNCTION internal.with_scans(p_snapshot jsonb, p_ids jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
  select case
    when not exists (select 1 from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) i
                      where i.value is distinct from p_snapshot -> 'scan' ->> 'scan_id')
      then p_snapshot
    else jsonb_set(coalesce(p_snapshot, '{}'::jsonb), '{scans}',
           (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
              from (select jsonb_array_elements_text(case when jsonb_typeof(p_snapshot -> 'scans') = 'array'
                                                          then p_snapshot -> 'scans' else '[]'::jsonb end) as x
                    union all
                    select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb))) t
             where x is distinct from p_snapshot -> 'scan' ->> 'scan_id'))
  end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
