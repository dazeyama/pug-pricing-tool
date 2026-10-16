CREATE OR REPLACE FUNCTION internal.lines_count_text(p_lines buy_lines[], p_word text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select internal.count_text(c.cards, c.bulk, p_word) from internal.line_counts(p_lines) c
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
