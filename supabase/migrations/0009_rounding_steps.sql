-- The store's rounding steps from $10 up, halved (owner, 2026-10-23; decision 478): under $1 to the cent; $1–$10
-- to the quarter; $10–$100 to the 50 cents (was the dollar); $100–$1,000 to the dollar (was the $5); $1,000 and up
-- to the $10. The app's roundDownPrice / roundUpPrice (src/lib/money.js) take the same steps; this is the
-- database's copy, which rounds a list's Cash and Credit totals (internal.lines_totals) and a collection's credit
-- offer (collection_set_status). Same signature, so its grants stay and the live build keeps working; a total the
-- database works out from here on rounds by the new steps, nothing already saved is changed.

CREATE OR REPLACE FUNCTION public.round_down_price(p numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select (floor(c / s) * s) / 100
  from (select floor(round(p * 100, 6)) as c) x,
       lateral (select case when x.c >= 100000 then 1000 when x.c >= 10000 then 100
                            when x.c >= 1000 then 50 when x.c >= 100 then 25 else 1 end as s) y
$function$;
