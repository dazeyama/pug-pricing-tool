-- From the database test run (TEST.md, section 18, 2026-10-12).

-- F11: three helpers in the internal schema were still open to everyone
-- (PUBLIC), unlike every other function: customer_key and customer_name
-- (0048) and import_lines (0047). Out of reach signed out (anon can't use
-- internal), but now granted to the app's role only, like the rest.
revoke execute on function internal.customer_key(text) from public, anon;
revoke execute on function internal.customer_name(text) from public, anon;
revoke execute on function internal.import_lines(public.buys, jsonb, uuid, uuid, text) from public, anon;
grant execute on function
  internal.customer_key(text),
  internal.customer_name(text),
  internal.import_lines(public.buys, jsonb, uuid, uuid, text)
  to authenticated, service_role;

-- master_inventory_add (0003, 0023, 0024), the one-step inventory upload, was
-- kept for the build before Phase E1 (0025). The app has uploaded with
-- master_inventory_start, cc_products_load and master_inventory_finish since,
-- and nothing calls it.
drop function public.master_inventory_add(text, text, integer, integer, text[], uuid);
