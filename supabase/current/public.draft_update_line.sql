CREATE OR REPLACE FUNCTION public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy   uuid;
  v_pos   integer;
  v_other uuid;
  v_opos  integer;
  v_snap  jsonb;
  r       buy_lines;
begin
  select l.buy_id, l.position, l.price_snapshot into v_buy, v_pos, v_snap
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;

  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  update buy_lines set
    game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
    set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
    collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
    finish = r.finish, first_edition = coalesce(r.first_edition, false),
    treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
    quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
    -- The scans the line came from stay with it (decision 391).
    price_source = r.price_source, price_snapshot = internal.with_scans(r.price_snapshot, internal.scan_ids(v_snap)), priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
    join buy_lines o on o.id = p_line_id
   where l.buy_id = v_buy and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
     -- A card on its own rate folds only into a line at that rate (decision 448), so its rate never spreads to
     -- other copies; one with none still folds into one with its own, taking it (0056; owner, 2026-10-15).
     and ((l.custom_cash_pct is not distinct from o.custom_cash_pct
           and l.custom_credit_pct is not distinct from o.custom_credit_pct)
          or (o.custom_cash_pct is null and o.custom_credit_pct is null))
   order by (l.custom_cash_pct is not distinct from o.custom_cash_pct
             and l.custom_credit_pct is not distinct from o.custom_credit_pct) desc, l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_pos then
      update buy_lines o
         set quantity = o.quantity + r.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(e.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, e.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, e.custom_credit_pct)
        from buy_lines e
       where o.id = v_other and e.id = p_line_id;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines o
         set quantity = o.quantity + x.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(x.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, x.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, x.custom_credit_pct)
        from buy_lines x
       where o.id = p_line_id and x.id = v_other;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return p_line_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
