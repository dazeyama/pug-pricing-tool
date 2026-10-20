CREATE OR REPLACE FUNCTION public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean DEFAULT true, p_draft_id uuid DEFAULT NULL::uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  v_buy  uuid;
  v_line uuid;
  r      buy_lines;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  -- A scan's card goes into the buy it was scanned for, or nowhere (decision 350).
  if p_draft_id is not null then
    -- Locked, and looked at again after a CONFIRM BUY in flight commits: a confirmed buy gets nothing more.
    select id into v_buy from buys where id = p_draft_id and status = 'draft' and draft_device_id = p_device for update;
    if v_buy is null then
      raise exception 'draft_gone';
    end if;
  else
    v_buy := draft_for_device(p_device, p_user);
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = v_buy
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
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
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind)
    values (
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
