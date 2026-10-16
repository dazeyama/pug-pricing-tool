CREATE OR REPLACE FUNCTION internal.unfix_line_rates(p_buy_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines set cash_pct = null, credit_pct = null where buy_id = p_buy_id;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
