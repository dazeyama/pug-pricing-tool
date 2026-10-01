-- The 9-argument confirm_buy (0009) was kept by 0020 only so the live site's
-- older build could still confirm buys. v0.9.1-final (2026-09-30) uses the
-- 11-argument one, with the purchase price, so the old one goes: a buy can
-- no longer be confirmed without a name, phone and price paid.

drop function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, jsonb, text);
