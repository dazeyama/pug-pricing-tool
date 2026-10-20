-- REPRICE? on a collection (owner, 2026-10-01): every card's buy price
-- brought up to today's prices in one go, for a project worked on for weeks.
-- The app works out each card's new price exactly as the Price screen would
-- (src/lib/reprice.js) and sends them all here. Only where cards could be
-- edited anyway: a Processing or Priced collection, or a project (a
-- customer's Paid/Ours and anything Completed are locked; Can't upload cards
-- refuses as always). Logged as one changelog entry with the totals.

create or replace function public.collection_reprice(
  p_buy_id           uuid,
  p_lines            jsonb,   -- [{ line_id, unit_price, market_price, price_source, price_snapshot,
                              --    priced_at, justtcg_card_id, justtcg_variant_id }]
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_before numeric;
  v_after  numeric;
  v_n      integer;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  select coalesce(sum(unit_price * quantity), 0) into v_before from buy_lines where buy_id = p_buy_id;

  update buy_lines l set
    unit_price         = (e ->> 'unit_price')::numeric,
    market_price       = (e ->> 'market_price')::numeric,
    price_source       = e ->> 'price_source',
    price_snapshot     = e -> 'price_snapshot',
    priced_at          = coalesce((e ->> 'priced_at')::timestamptz, now()),
    justtcg_card_id    = e ->> 'justtcg_card_id',
    justtcg_variant_id = e ->> 'justtcg_variant_id'
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
  where l.id = (e ->> 'line_id')::uuid and l.buy_id = p_buy_id;
  get diagnostics v_n = row_count;

  select coalesce(sum(unit_price * quantity), 0) into v_after from buy_lines where buy_id = p_buy_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_repriced', '{}', 0, 0,
    collection_totals(b, v_after), '[]',
    jsonb_build_array(jsonb_build_object('field', 'market', 'before', money_text(v_before), 'after', money_text(v_after))),
    format('Repriced at today''s prices: %s card line%s, market %s → %s.', v_n,
           case when v_n = 1 then '' else 's' end, money_text(v_before), money_text(v_after)));
  return jsonb_build_object('lines', v_n, 'before', v_before, 'after', v_after);
end;
$$;

revoke execute on function public.collection_reprice(uuid, jsonb, uuid, uuid, integer) from public, anon;
grant execute on function public.collection_reprice(uuid, jsonb, uuid, uuid, integer) to authenticated;
