CREATE OR REPLACE FUNCTION internal.fix_line_rates(b buys)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines l
     set cash_pct = internal.line_pct(l, b, 'cash'),
         credit_pct = internal.line_pct(l, b, 'credit')
   where l.buy_id = b.id;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
