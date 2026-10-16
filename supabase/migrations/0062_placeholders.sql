-- Placeholders (owner, 2026-10-16): "1 BULK placeholder", one for each game,
-- for a card the search can't find yet. Bulk in most ways (bulk_kind
-- mtg_placeholder / pkm_placeholder, set BULK, no number, NM; never exported,
-- completed or printed), but a card in others: a name of its own as typed
-- ("Team Rocket's, Meowth 117", else "Placeholder"), a price always typed in
-- (price_source manual), one card per item, the low-end / high-end rates by
-- its price like a card (owner's choice), Set Rate, and the header search
-- finds it by its name (owner's choice). Two placeholders merge only with the
-- same name and price: every merge now also needs the same name (the same
-- printing always has it).

alter table public.buy_lines drop constraint buy_lines_bulk_kind_check;
alter table public.buy_lines add constraint buy_lines_bulk_kind_check
  check (bulk_kind in ('mtg_100_common', 'mtg_100_rare', 'mtg_10_dollar', 'mtg_10_fifty', 'pkm_100', 'pkm_100_ex',
                       'pkm_10_dollar', 'pkm_10_fifty', 'mtg_placeholder', 'pkm_placeholder'));
-- A placeholder's price is always typed in.
alter table public.buy_lines add constraint buy_lines_placeholder_check
  check (bulk_kind is null or bulk_kind not like '%placeholder' or price_source = 'manual');

-- The low-end and high-end rates: a placeholder takes them by its price, like a card.
CREATE OR REPLACE FUNCTION internal.line_pct(l buy_lines, b buys, p_side text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case
           when p_side = 'cash' and l.cash_pct is not null then l.cash_pct
           when p_side = 'credit' and l.credit_pct is not null then l.credit_pct
           when p_side = 'cash' and l.custom_cash_pct is not null then l.custom_cash_pct
           when p_side = 'credit' and l.custom_credit_pct is not null then l.custom_credit_pct
           when b.custom_cash_pct is not null or b.custom_credit_pct is not null then x.base
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price < (x.t -> 'low' ->> 'under')::numeric then (x.t -> 'low' ->> p_side)::numeric
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price > (x.t -> 'high' ->> 'over')::numeric then (x.t -> 'high' ->> p_side)::numeric
           else x.base end
  from (select internal.rate_tiers() as t,
               case p_side when 'cash' then coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct'))
                           else coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')) end as base) x
$function$
;

-- Merging: the same name too, so two placeholders merge only when they name the same card.
CREATE OR REPLACE FUNCTION public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy  uuid;
  v_line uuid;
  r      buy_lines;
begin
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  v_buy := draft_for_device(p_device, p_user);

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = v_buy
       and l.game = r.game and l.lang = r.lang
       and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
       and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
       and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
       and l.treatments = coalesce(r.treatments, '[]'::jsonb)
       and l.condition = r.condition
       and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
       and l.name = r.name   -- a placeholder: the same name typed (owner, 2026-10-16)
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
  return v_line;
end;
$function$
;
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
       and l.game = r.game and l.lang = r.lang
       and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
       and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
       and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
       and l.treatments = coalesce(r.treatments, '[]'::jsonb)
       and l.condition = r.condition
       and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
       and l.name = r.name   -- a placeholder: the same name typed (owner, 2026-10-16)
       and l.struck_at is null   -- never into a struck line
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
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], r.quantity, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(format('%s card%s added', r.quantity, case when r.quantity = 1 then '' else 's' end)));
  return v_line;
end;
$function$
;
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
  r       buy_lines;
begin
  select l.buy_id, l.position into v_buy, v_pos
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
    price_source = r.price_source, price_snapshot = r.price_snapshot, priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_buy and l.id <> p_line_id
     and l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
       and l.name = r.name   -- a placeholder: the same name typed (owner, 2026-10-16)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_pos then
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

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return p_line_id;
end;
$function$
;
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
     and l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
       and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
       and l.name = r.name   -- a placeholder: the same name typed (owner, 2026-10-16)
     and l.struck_at is null   -- never into a struck line
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
$function$
;

-- The header search finds placeholders by their name (owner, 2026-10-16), not bulk.
CREATE OR REPLACE FUNCTION public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean DEFAULT false)
 RETURNS TABLE(line_id uuid, buy_id uuid, kind text, status text, customer_name text, paid_method text, confirmed_at timestamp with time zone, confirmed_by uuid, created_at timestamp with time zone, buy_number integer, game text, lang text, name text, name_en text, set_code text, collector_number text, finish text, first_edition boolean, treatments jsonb, condition text, quantity integer, image_url text, completed boolean, collection_kind text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_name, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_name, '')) = '' as any_name
  ),
  hits as (
    select l.id as line_id, l.buy_id, b.kind, b.status, b.customer_name, b.paid_method,
           b.confirmed_at, b.confirmed_by, b.created_at, l.game, l.lang, l.name, l.name_en, l.set_code,
           l.collector_number, l.finish, l.first_edition, l.treatments, l.condition, l.quantity, l.image_url,
           l.completed_at is not null as completed,
           case when b.kind = 'collection' then
             case when b.system_key is not null then 'system' when b.project then 'project' else 'collection' end
           end as collection_kind,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed' and (p_all or l.completed_at is null))
         or (b.kind = 'collection'
             and (b.status = 'paid' or (p_all and b.status in ('processing', 'priced', 'completed', 'rejected')))))
       and (l.bulk_kind is null or l.bulk_kind like '%placeholder')   -- placeholders by their name
       and l.struck_at is null   -- struck: moved elsewhere
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
     order by newest desc, l.buy_id, l.position
     limit 200
  )
  select h.line_id, h.buy_id, h.kind, h.status, h.customer_name, h.paid_method,
         h.confirmed_at, h.confirmed_by, h.created_at,
         case when h.kind = 'walk_in' then (
           select count(*)::integer from buys x
            where x.kind = 'walk_in' and x.status = 'confirmed'
              and (x.confirmed_at at time zone 'America/Los_Angeles')::date
                = (h.confirmed_at at time zone 'America/Los_Angeles')::date
              and (x.confirmed_at, x.id) <= (h.confirmed_at, h.buy_id)
              and exists (select 1 from buy_lines y where y.buy_id = x.id and y.game = h.game))
         end,
         h.game, h.lang, h.name, h.name_en, h.set_code, h.collector_number, h.finish,
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url, h.completed,
         h.collection_kind
    from hits h
   order by h.newest desc, h.buy_id, h.position
$function$
;