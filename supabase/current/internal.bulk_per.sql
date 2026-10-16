CREATE OR REPLACE FUNCTION internal.bulk_per(p_kind text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p_kind
    when 'mtg_100_common' then 100 when 'mtg_100_rare' then 100
    when 'pkm_100' then 100 when 'pkm_100_ex' then 100
    when 'mtg_10_dollar' then 10 when 'mtg_10_fifty' then 10
    when 'pkm_10_dollar' then 10 when 'pkm_10_fifty' then 10
  end
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
