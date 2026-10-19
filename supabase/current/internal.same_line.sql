CREATE OR REPLACE FUNCTION internal.same_line(a buy_lines, b buy_lines)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select a.game = b.game and a.lang = b.lang and a.name = b.name
     and a.set_code = b.set_code and a.collector_number = b.collector_number
     and coalesce(a.scryfall_id, '') = coalesce(b.scryfall_id, '')
     and coalesce(a.tcgdex_id, '') = coalesce(b.tcgdex_id, '')
     and coalesce(a.justtcg_variant_id, '') = coalesce(b.justtcg_variant_id, '')
     and a.finish = b.finish and a.first_edition = b.first_edition
     and a.treatments = b.treatments and a.condition = b.condition
     and a.unit_price = b.unit_price and a.price_source = b.price_source
     and a.bulk_kind is not distinct from b.bulk_kind
     and a.custom_cash_pct is not distinct from b.custom_cash_pct
     and a.custom_credit_pct is not distinct from b.custom_credit_pct
     and a.cash_pct is not distinct from b.cash_pct
     and a.credit_pct is not distinct from b.credit_pct
     -- Stamped and unstamped are never one line (decision 345).
     and a.cc_status is not distinct from b.cc_status
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
