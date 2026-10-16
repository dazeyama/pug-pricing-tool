CREATE OR REPLACE FUNCTION internal.count_text(p_cards integer, p_bulk integer, p_word text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case
    when coalesce(p_bulk, 0) = 0 or coalesce(p_cards, 0) <> 0 then
      concat_ws(' ', to_char(coalesce(p_cards, 0), 'FM999,999,990'), p_word,
                case when coalesce(p_cards, 0) = 1 then 'card' else 'cards' end)
      || case when coalesce(p_bulk, 0) <> 0 then ' + ' || to_char(p_bulk, 'FM999,999,990') || ' bulk' else '' end
    else concat_ws(' ', to_char(p_bulk, 'FM999,999,990'), p_word, 'bulk')
  end
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
