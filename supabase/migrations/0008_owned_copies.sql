-- How many copies of a card we likely own (owner, 2026-10-22; decision 448), for the Price screen's counter
-- and its rate suggestion (5% off per copy over 2, up to 50%, applied only when staff click it):
--   cc_products.total_qty    the inventory CSV's "Total Qty", kept from now on (cc_products_load takes it).
--                            A file loaded before this has none: it counts once the inventory is uploaded again;
--   owned_copies              one printing's and one card's copies: the current inventory's Total Qty, plus the
--                            cards that are ours and not in that inventory yet (Paid/Ours, as the header's search
--                            reads it, and cards exported since the inventory was uploaded);
--   draft_add_line and        a card can come with its own rate (custom_cash_pct / custom_credit_pct, as Set Rate
--   collection_add_line      gives one), in the same write: the suggestion applied on ADD CARD. A card with an own
--                            rate merges only into a line with that same rate; without one, as before (the copies
--                            take the line's rate). Same signatures, so the live build keeps working;
--   buys.auto_rates           Auto apply rates? (item 5), set by draft_set_auto_rates and collection_update_info;
--   draft_update_line and     SAVE EDIT folds a card on its own rate only into a line at that rate (the review of
--   collection_update_line   this migration: otherwise an edit spreads one rate over the other line's copies); a
--                            card with none still folds into one with its own, taking it, as before.
-- Magic only: the inventory is Magic singles, and the counter shows for Magic cards (Pokémon's CC matching
-- doesn't exist yet).

alter table public.cc_products add column total_qty integer;

CREATE OR REPLACE FUNCTION public.cc_products_load(p_file_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  -- An upload started before the current file is over (decision 414): its products are being cleared.
  if not exists (select 1 from master_inventory_files f
                  where f.id = p_file_id and not f.is_current
                    and not exists (select 1 from master_inventory_files c where c.is_current and c.uploaded_at > f.uploaded_at)) then
    raise exception 'upload_gone';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'bad_batch';
  end if;
  insert into cc_products (file_id, product_id, cc_id, product_name, category, base_key, bracket,
                           foil_kind, variants, catalog_path, total_qty)
  select p_file_id, r.product_id, r.cc_id, r.product_name, coalesce(r.category, ''), coalesce(r.base_key, ''),
         r.bracket, r.foil_kind, coalesce(r.variants, '{}'), coalesce(r.catalog_path, ''), r.total_qty
    from jsonb_to_recordset(p_rows) as r(product_id text, cc_id text, product_name text, category text,
                                         base_key text, bracket text, foil_kind text, variants text[],
                                         catalog_path text, total_qty integer)
   where r.product_id is not null and r.product_name is not null
  on conflict (file_id, product_id) do update
     set cc_id = excluded.cc_id, product_name = excluded.product_name, category = excluded.category,
         base_key = excluded.base_key, bracket = excluded.bracket, foil_kind = excluded.foil_kind,
         variants = excluded.variants, catalog_path = excluded.catalog_path, total_qty = excluded.total_qty;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- One printing's and one card's copies (decision 448). The app finds the printing's CC product as the export does
-- (p_product_id, null when there's no clear one) and passes the card's CC names as the export searches them
-- (p_base_keys: its name, flavor name and front face). Counted:
--   cc_printing   that product's Total Qty (below zero: none); null with no product, or a file loaded without
--                 quantities;
--   cc_card       the Total Qty of every product of those names (Art Series cards aren't the card; a count below
--                 zero counts as none); null when the names have products but none has a quantity, or there's
--                 no inventory;
--   ours_printing / ours_card   Magic cards that are ours and not in the inventory yet, of that printing and
--                 finish (p_scryfall_id, p_finish) and of that name (p_name_key): a confirmed walk-in's or a Paid or
--                 Completed collection's card, not struck, not bulk (nor a placeholder: no export or Completed ever
--                 takes one, so it would count for good), and either
--                   not stamped by an export (cc_status), not marked done (a walk-in's completed_at; a collection's
--                   cards never get one) and not in a Completed collection; or
--                   exported to CC after the current inventory was uploaded (cc_exported_at, which a collection's
--                   export sets too, and a re-export from Can't upload cards or Bulk pulled stamps again).
--                 A card copied to Can't upload cards or Bulk pulled from exports counts as its copy there, never
--                 as itself too (the copy's source_line_id);
--   cc_list / ours_list   which printings those are (the owner, 2026-10-22: "it has to show specifically,
--                 which printings we own"): the inventory's products of those names with a Total Qty above zero
--                 ({ product_id, category, name, qty }), and ours by set, number and finish ({ scryfall_id,
--                 set_code, set_name, number, finish, qty }), most first, each marked `this` when it's the printing
--                 asked about. The printing's own product counts for the card and is listed even when it's filed
--                 under another name (a link staff made at export), so This printing never passes All printings;
--   inventory_at  when the current inventory was uploaded (null: none, and the CC counts are unknown).
create function public.owned_copies(p_product_id text, p_base_keys text[], p_name_key text, p_scryfall_id text,
                                    p_finish text)
returns jsonb
language sql
stable
set search_path = public, internal
as $$
  with f as (
    select id, uploaded_at from master_inventory_files where is_current limit 1
  ),
  -- The card's products: those of its names, and the printing's own even when staff linked it at export to one
  -- filed under another name (its count is the printing's, so it's the card's too).
  card_products as (
    select p.product_id, p.category, p.product_name, p.total_qty
      from cc_products p join f on p.file_id = f.id
     where p.product_id = p_product_id
        or (p.base_key = any(coalesce(p_base_keys, '{}')) and p.category not like 'Art Series%')
  ),
  cc as (
    select count(*) as products, count(p.total_qty) as counted, sum(greatest(p.total_qty, 0)) as qty
      from card_products p
  ),
  ours as (
    select l.scryfall_id, l.finish, l.quantity, upper(l.set_code) as set_code, l.set_name, l.collector_number
      from buy_lines l
      join buys b on b.id = l.buy_id
      left join f on true
     where l.game = 'mtg'
       and l.name_key = p_name_key
       and l.bulk_kind is null
       and l.struck_at is null
       and ((b.kind = 'walk_in' and b.status = 'confirmed')
            or (b.kind = 'collection' and b.status in ('paid', 'completed')))
       and not exists (select 1 from buy_lines c where c.source_line_id = l.id)
       and ((l.cc_status is null and l.completed_at is null and b.status <> 'completed')
            or (l.cc_status = 'exported' and l.cc_exported_at > f.uploaded_at))
  )
  select jsonb_build_object(
    'cc_printing', (select case when p.total_qty is not null then greatest(p.total_qty, 0) end from cc_products p join f on p.file_id = f.id where p.product_id = p_product_id),
    'cc_card', (select case when not exists (select 1 from f) or (cc.products > 0 and cc.counted = 0) then null
                            else coalesce(cc.qty, 0) end from cc),
    'ours_printing', (select coalesce(sum(o.quantity), 0) from ours o
                       where o.scryfall_id = p_scryfall_id and o.finish = p_finish),
    'ours_card', (select coalesce(sum(o.quantity), 0) from ours o),
    -- Which printings those are (the owner: "it has to show specifically, which printings we own"), most first:
    'cc_list', (select coalesce(jsonb_agg(jsonb_build_object(
                         'product_id', p.product_id, 'category', p.category, 'name', p.product_name, 'qty', p.total_qty,
                         'this', p.product_id is not distinct from p_product_id)
                       order by p.total_qty desc, p.category, p.product_name, p.product_id), '[]'::jsonb)
                  from card_products p
                 where p.total_qty > 0),
    'ours_list', (select coalesce(jsonb_agg(jsonb_build_object(
                           'scryfall_id', x.scryfall_id, 'set_code', x.set_code, 'set_name', x.set_name,
                           'number', x.collector_number, 'finish', x.finish, 'qty', x.qty,
                           'this', coalesce(x.scryfall_id = p_scryfall_id and x.finish = p_finish, false))
                         -- Collector numbers as numbers: 9 before 10.
                         order by x.qty desc, x.set_code, nullif(substring(x.collector_number from '^[0-9]+'), '')::int,
                                  x.collector_number, x.finish, x.scryfall_id), '[]'::jsonb)
                    from (select o.scryfall_id, o.set_code, max(o.set_name) as set_name, o.collector_number, o.finish,
                                 sum(o.quantity) as qty
                            from ours o
                           group by o.scryfall_id, o.set_code, o.collector_number, o.finish) x),
    'inventory_at', (select f.uploaded_at from f))
$$;

revoke all on function public.owned_copies(text, text[], text, text, text) from public, anon;
grant execute on function public.owned_copies(text, text[], text, text, text) to authenticated, service_role;

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
  -- Its own rate, if it comes with one (decision 448), checked as Set Rate checks it.
  -- As sent: the line's columns would round 12.345 to 12.35 before it's looked at.
  perform internal.check_rate((p_line ->> 'custom_cash_pct')::numeric);
  perform internal.check_rate((p_line ->> 'custom_credit_pct')::numeric);
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
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind,
      r.custom_cash_pct, r.custom_credit_pct)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

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
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[r]) || ' added'));
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

-- Auto apply rates? (owner, 2026-10-22; decision 448, item 5): a box under the counter. Checked, every card added
-- from then on that qualifies goes on at the suggested lower rate, scans from the phone too; the cards already on
-- the list keep theirs. Kept with the buy, so a reload or another computer keeps it: a walk-in's until CONFIRM BUY,
-- an overnight buy's as long as it can be edited. A project has no rates, so none.
alter table public.buys add column auto_rates boolean not null default false;

-- The walk-in's box, as draft_set_custom_rates sets its rates.
create function public.draft_set_auto_rates(p_device uuid, p_on boolean, p_user uuid)
returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_buy uuid;
begin
  v_buy := draft_for_device(p_device, p_user);
  update buys
     set auto_rates = coalesce(p_on, false),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_buy and auto_rates is distinct from coalesce(p_on, false);
  return v_buy;
end;
$$;

revoke all on function public.draft_set_auto_rates(uuid, boolean, uuid) from public, anon;
grant execute on function public.draft_set_auto_rates(uuid, boolean, uuid) to authenticated, service_role;

-- An overnight buy's box: one of its details (auto_rates), in the Changelog like its rates.
CREATE OR REPLACE FUNCTION public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_name   text;
  v_phone  text;
  v_notes  text;
  v_last4  text;
  v_cash   numeric;
  v_credit numeric;
  v_rows   jsonb := '[]'::jsonb;
  v_names  text[] := '{}';
  v_master numeric;
  v_auto   boolean;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  -- A project has no rates (owner, 2026-10-15): it's the store's own cards.
  -- Auto apply rates is true or false (decision 448).
  if p_fields ? 'auto_rates' and jsonb_typeof(p_fields -> 'auto_rates') is distinct from 'boolean' then
    raise exception 'bad_auto_rates';
  end if;
  if b.project and (p_fields ? 'custom_cash_pct' or p_fields ? 'custom_credit_pct'
                    or coalesce((p_fields ->> 'auto_rates')::boolean, false)) then
    raise exception 'project_rates';
  end if;
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_last4 := b.id_last4;
  v_cash := b.custom_cash_pct;
  v_credit := b.custom_credit_pct;
  v_auto := b.auto_rates;

  if p_fields ? 'name' then
    v_name := btrim(regexp_replace(coalesce(p_fields ->> 'name', ''), '\s+', ' ', 'g'));
    if char_length(v_name) not between 1 and 80 then
      raise exception 'bad_name';
    end if;
    if v_name is distinct from b.customer_name then
      v_rows := v_rows || jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', v_name);
      v_names := v_names || 'name'::text;
    end if;
  end if;

  if p_fields ? 'phone' then
    v_phone := coalesce(p_fields ->> 'phone', '');
    if v_phone !~ '^[0-9]{10}$' then
      raise exception 'bad_phone';
    end if;
    if v_phone is distinct from b.phone then
      v_rows := v_rows || jsonb_build_object('field', 'phone',
        'before', format_phone(b.phone), 'after', format_phone(v_phone));
      v_names := v_names || 'phone'::text;
    end if;
  end if;

  if p_fields ? 'id_last4' then
    v_last4 := nullif(upper(btrim(coalesce(p_fields ->> 'id_last4', ''))), '');
    if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
      raise exception 'bad_last4';
    end if;
    if v_last4 is distinct from b.id_last4 then
      v_rows := v_rows || jsonb_build_object('field', 'last 4 ID', 'before', b.id_last4, 'after', v_last4);
      v_names := v_names || 'last 4 ID'::text;
    end if;
  end if;

  if p_fields ? 'notes' then
    v_notes := btrim(coalesce(p_fields ->> 'notes', ''));
    if v_notes is distinct from b.notes then
      v_rows := v_rows || jsonb_build_object('field', 'notes', 'before', b.notes, 'after', v_notes);
      v_names := v_names || 'notes'::text;
    end if;
  end if;

  -- Rates read "cash %: 33 → 40", and cleared "cash %: 40 → master (33)" (spec 12.3).
  if p_fields ? 'custom_cash_pct' then
    v_cash := (p_fields ->> 'custom_cash_pct')::numeric;
    if v_cash is not null and (v_cash < 0 or v_cash > 100) then
      raise exception 'bad_pct';
    end if;
    if v_cash is distinct from b.custom_cash_pct then
      v_master := master_pct('cash_pct');
      v_rows := v_rows || jsonb_build_object('field', 'cash %',
        'before', pct_text(coalesce(b.custom_cash_pct, v_master)),
        'after', case when v_cash is null then 'master (' || pct_text(v_master) || ')' else pct_text(v_cash) end);
      v_names := v_names || 'cash %'::text;
    end if;
  end if;

  if p_fields ? 'custom_credit_pct' then
    v_credit := (p_fields ->> 'custom_credit_pct')::numeric;
    if v_credit is not null and (v_credit < 0 or v_credit > 100) then
      raise exception 'bad_pct';
    end if;
    if v_credit is distinct from b.custom_credit_pct then
      v_master := master_pct('credit_pct');
      v_rows := v_rows || jsonb_build_object('field', 'credit %',
        'before', pct_text(coalesce(b.custom_credit_pct, v_master)),
        'after', case when v_credit is null then 'master (' || pct_text(v_master) || ')' else pct_text(v_credit) end);
      v_names := v_names || 'credit %'::text;
    end if;
  end if;

  -- Auto apply rates (decision 448): the lower rate for the copies we own, on every card added from now on.
  if p_fields ? 'auto_rates' then
    v_auto := coalesce((p_fields ->> 'auto_rates')::boolean, false);
    if v_auto is distinct from b.auto_rates then
      v_rows := v_rows || jsonb_build_object('field', 'auto apply rates',
        'before', case when b.auto_rates then 'on' else 'off' end, 'after', case when v_auto then 'on' else 'off' end);
      v_names := v_names || 'auto apply rates'::text;
    end if;
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return;
  end if;

  update buys
     set customer_name = v_name, phone = v_phone, id_last4 = v_last4, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit, auto_rates = v_auto,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$function$;

-- SAVE EDIT (decision 448): with the suggestion applied on ADD CARD, a card's discounted copies and its others are
-- two lines, and an edit of the discounted one mustn't put its rate on the others, or lose it. A card on its own
-- rate folds only into a line at that rate; a card with none folds as before (0056: into the first line of the
-- same card, taking its own rate if it has one), a line with none first.
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
    -- The scans the line came from stay with it (decision 391).
    price_source = r.price_source, price_snapshot = internal.with_scans(r.price_snapshot, internal.scan_ids(v_old.price_snapshot)), priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
    join buy_lines o on o.id = p_line_id
   where l.buy_id = v_old.buy_id and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
     -- A card on its own rate folds only into a line at that rate (decision 448), so its rate never spreads to
     -- other copies; one with none still folds into one with its own, taking it (0056; owner, 2026-10-15).
     and ((l.custom_cash_pct is not distinct from o.custom_cash_pct
           and l.custom_credit_pct is not distinct from o.custom_credit_pct)
          or (o.custom_cash_pct is null and o.custom_credit_pct is null))
     and l.struck_at is null   -- never into a struck line
     and l.cc_status is null   -- nor fold an exported one (decision 345)
   order by (l.custom_cash_pct is not distinct from o.custom_cash_pct
             and l.custom_credit_pct is not distinct from o.custom_credit_pct) desc, l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_old.position then
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
