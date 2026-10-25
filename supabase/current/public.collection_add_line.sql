CREATE OR REPLACE FUNCTION public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b      buys;
  r      buy_lines;
  v_line uuid;
  v_rec  buy_lines;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  -- Its own rate, if it comes with one (decision 448), checked as Set Rate checks it; a project has no rates.
  -- As sent: the line's columns would round 12.345 to 12.35 before it's looked at.
  perform internal.check_rate((p_line ->> 'custom_cash_pct')::numeric);
  perform internal.check_rate((p_line ->> 'custom_credit_pct')::numeric);
  if b.project and (r.custom_cash_pct is not null or r.custom_credit_pct is not null) then
    raise exception 'project_rates';
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = p_buy_id
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
       and l.struck_at is null   -- never into a struck line
       and l.cc_status is null   -- nor an exported one (decision 345)
       -- A card with its own rate only joins a line with that rate (decision 448).
       and ((r.custom_cash_pct is null and r.custom_credit_pct is null)
            or (l.custom_cash_pct is not distinct from r.custom_cash_pct
                and l.custom_credit_pct is not distinct from r.custom_credit_pct))
     -- A copy with no rate of its own joins a line with none first, else one at its own rate (decision 448).
     order by (l.custom_cash_pct is not distinct from r.custom_cash_pct
               and l.custom_credit_pct is not distinct from r.custom_credit_pct) desc, l.position
     limit 1;   -- the same card, own rate or not: the copies take the line's rate (owner, 2026-10-15)
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity,
           -- The scan it came from, on the line it joined (decision 351).
           price_snapshot = case when r.price_snapshot -> 'scan' ->> 'scan_id' is null then price_snapshot
             else jsonb_set(coalesce(price_snapshot, '{}'::jsonb), '{scans}',
                            coalesce(price_snapshot -> 'scans', '[]'::jsonb) || to_jsonb(r.price_snapshot -> 'scan' ->> 'scan_id')) end
     where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind,
      custom_cash_pct, custom_credit_pct)
    values (
      p_buy_id,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = p_buy_id),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind,
      r.custom_cash_pct, r.custom_credit_pct)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = p_buy_id;

  -- The copies added, at the card's rate (and on the row, for a folded run's totals).
  select * into v_rec from buy_lines where id = v_line;
  v_rec.quantity := r.quantity;
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], (internal.line_counts(array[r])).cards, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'bulk_per', internal.bulk_per(r.bulk_kind), 'game', r.game,
      -- No price for a card added with none (decision 513): the Changelog shows none, not $0.
      'unit_price', case when r.price_source = 'unpriced' then null else r.unit_price end,
      'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[r]) || ' added'));
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
