-- REPRICE? on Can't upload cards too (owner, 2026-10-01): its cards can sit
-- there for weeks, so their buy prices can be brought up to today's beside
-- its own EXPORT. collection_reprice (0033) went through collection_for_write
-- as a content edit, which Can't upload cards refuses; now it checks for
-- itself: Can't upload cards and projects any time, other collections only
-- while Processing or Priced (a customer's Paid/Ours and anything Completed
-- stay locked, as before).

create or replace function public.collection_reprice(
  p_buy_id           uuid,
  p_lines            jsonb,
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
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status = 'paid' and b.system_key is null and not b.project then
    raise exception 'collection_paid';
  end if;
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
