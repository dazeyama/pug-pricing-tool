CREATE OR REPLACE FUNCTION internal.lines_totals(b buys, p_lines buy_lines[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
           'market', coalesce(sum(x.m), 0),
           'cash', round_down_price(coalesce(sum(x.m * x.c), 0) / 100)::numeric(12,2),
           'credit', round_down_price(coalesce(sum(x.m * x.cr), 0) / 100)::numeric(12,2),
           'cash_pct', coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct')),
           'credit_pct', coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')))
  from (select l.unit_price * l.quantity as m,
               internal.line_pct(l, b, 'cash') as c,
               internal.line_pct(l, b, 'credit') as cr
          from unnest(coalesce(p_lines, '{}'::buy_lines[])) l) x
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
