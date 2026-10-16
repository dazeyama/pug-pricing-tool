CREATE OR REPLACE FUNCTION public.cc_condition_word(p_condition text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p_condition
    when 'NM' then 'Near Mint' when 'LP' then 'Lightly Played' when 'MP' then 'Moderately Played'
    when 'HP' then 'Heavily Played' when 'DMG' then 'Damaged' end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
