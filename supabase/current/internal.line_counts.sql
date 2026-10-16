CREATE OR REPLACE FUNCTION internal.line_counts(p_lines buy_lines[], OUT cards integer, OUT bulk integer)
 RETURNS record
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(sum(l.quantity) filter (where internal.bulk_per(l.bulk_kind) is null), 0)::integer,
         coalesce(sum(l.quantity * internal.bulk_per(l.bulk_kind)), 0)::integer
    from unnest(p_lines) l
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
