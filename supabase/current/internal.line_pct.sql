CREATE OR REPLACE FUNCTION internal.line_pct(l buy_lines, b buys, p_side text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case
           when p_side = 'cash' and l.cash_pct is not null then l.cash_pct
           when p_side = 'credit' and l.credit_pct is not null then l.credit_pct
           when p_side = 'cash' and l.custom_cash_pct is not null then l.custom_cash_pct
           when p_side = 'credit' and l.custom_credit_pct is not null then l.custom_credit_pct
           when b.custom_cash_pct is not null or b.custom_credit_pct is not null then x.base
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price < (x.t -> 'low' ->> 'under')::numeric then (x.t -> 'low' ->> p_side)::numeric
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price > (x.t -> 'high' ->> 'over')::numeric then (x.t -> 'high' ->> p_side)::numeric
           else x.base end
  from (select internal.rate_tiers() as t,
               case p_side when 'cash' then coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct'))
                           else coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')) end as base) x
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
