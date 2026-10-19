-- 0081: a stamped line is frozen (DESIGN_SPEC decision 345).
--
-- The guarantee that an exported card never changes rested on EXPORT making the
-- collection Completed; 0073 (decision 294) let projects export in parts and stay open,
-- and an unlocked collection keeps its stamps, but no collection writer looked at
-- cc_status. So a new copy could merge into an exported line (never sent), an edit could
-- fold lines together (sent twice, or never), strike and restore moved copies between
-- stamped and unstamped lines, and × left a Can't upload copy at the wrong count.
--
-- Now a line with an export stamp (cc_status 'exported' or 'cant_upload') changes only
-- through the export machinery (export_lines, collection_unexport, export_undo_day,
-- buy_unexport, cant_upload_return). Edit, strike, restore and × refuse it
-- (line_exported: "Undo export… first", the owner, 2026-10-19), REPRICE leaves it, and
-- stamped and unstamped lines never merge, fold or twin. Undo export stays whole. Same
-- signatures, so the grants stay.

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

CREATE OR REPLACE FUNCTION public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  r      buy_lines;
  v_line uuid;
  v_rec  buy_lines;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = p_buy_id
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
       and l.struck_at is null   -- never into a struck line
       and l.cc_status is null   -- nor an exported one (decision 345)
     limit 1;   -- the same card, own rate or not: the copies take the line's rate (owner, 2026-10-15)
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind)
    values (
      p_buy_id,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = p_buy_id),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = p_buy_id;

  -- The copies added, at the card's rate (and on the row, for a folded run's totals).
  select * into v_rec from buy_lines where id = v_line;
  v_rec.quantity := r.quantity;
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], (internal.line_counts(array[r])).cards, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'bulk_per', internal.bulk_per(r.bulk_kind), 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[r]) || ' added'));
  return v_line;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b       buys;
  v_old   buy_lines;
  v_other uuid;
  v_opos  integer;
  r       buy_lines;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
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
    price_source = r.price_source, price_snapshot = r.price_snapshot, priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
     and l.struck_at is null   -- never into a struck line
     and l.cc_status is null   -- nor fold an exported one (decision 345)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_old.position then
      update buy_lines o
         set quantity = o.quantity + r.quantity,
             custom_cash_pct = coalesce(o.custom_cash_pct, e.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, e.custom_credit_pct)
        from buy_lines e
       where o.id = v_other and e.id = p_line_id;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines o
         set quantity = o.quantity + x.quantity,
             custom_cash_pct = coalesce(o.custom_cash_pct, x.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, x.custom_credit_pct)
        from buy_lines x
       where o.id = p_line_id and x.id = v_other;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  perform collection_event(b, p_user, p_device, 'collection_line_edited',
    (select array_agg(distinct g order by g) from unnest(array[v_old.game, r.game]) g),
    r.quantity, v_old.quantity, null,
    jsonb_build_array(
      jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
        'text', coalesce(p_old_text, v_old.quantity || ' ' || v_old.name)),
      jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
        'text', coalesce(p_new_text, r.quantity || ' ' || r.name))),
    '[]', 'Card edited.');
  return p_line_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
  v_id  uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.system_key is not null then
    raise exception 'system_collection';
  end if;
  if b.project then
    raise exception 'project_no_strike';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status <> 'paid' then
    raise exception 'strike_paid_only';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform collection_event(b, p_user, p_device, 'collection_cards_struck', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the list, crossed out, and never exported'));
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Paid/Ours may still lose cards (owner, 2026-09-29); Completed may not.
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  -- Exported, or in Can't upload cards: Undo export first (decision 345).
  if v_old.cc_status is not null then
    raise exception 'line_exported';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (and on the row, for a folded run)
  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, (internal.line_counts(array[v_old])).cards,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'bulk_per', internal.bulk_per(v_old.bulk_kind), 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' removed'));
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_id  uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if v_old.struck_at is null then
    raise exception 'line_not_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
  end if;

  v_id := internal.restore_line(v_old.id);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform collection_event(b, p_user, p_device, 'collection_cards_restored', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_old.quantity || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old], 'struck') || ' restored'));
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
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
  where l.id = (e ->> 'line_id')::uuid and l.buy_id = p_buy_id
    and l.cc_status is null;   -- an exported card keeps its price (decision 345)
  get diagnostics v_n = row_count;

  select coalesce(sum(unit_price * quantity), 0) into v_after from buy_lines where buy_id = p_buy_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_repriced', '{}', 0, 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), '[]',
    jsonb_build_array(jsonb_build_object('field', 'market', 'before', money_text(v_before), 'after', money_text(v_after))),
    format('Repriced at today''s prices: %s card line%s, market %s → %s.', v_n,
           case when v_n = 1 then '' else 's' end, money_text(v_before), money_text(v_after)));
  return jsonb_build_object('lines', v_n, 'before', v_before, 'after', v_after);
end;
$function$;
