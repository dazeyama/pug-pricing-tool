-- 0012: projects that skip pricing (decision 513; the owner's item 6 of 2026-10-24, part 1).
--
-- A project can be switched to skip pricing, on its own screen, on or off at any time: the cards added while it's
-- on go in with no price, so no JustTCG request is spent on them. A card with no price is price_source 'unpriced'
-- at $0 (every sum, merge and copy keeps working); the app shows a dash for it and the totals say "not priced".
-- EXPORT works out its Sell Price from today's prices as for any card, and REPRICE? prices it once the switch is
-- off. It's never in a buy or an overnight buy: Convert to buy refuses a project that still has one.

-- The switch: a project's only.
alter table public.buys add column skip_pricing boolean not null default false;
alter table public.buys add constraint buys_skip_pricing_project check (not skip_pricing or project);

-- A card with no price: 'unpriced', at $0. Never bulk: buy_lines_bulk_check already keeps bulk to 'bulk' or
-- 'manual' (bulk has its Settings value, no request to spend).
alter table public.buy_lines drop constraint buy_lines_price_source_check;
alter table public.buy_lines add constraint buy_lines_price_source_check CHECK (price_source = ANY (ARRAY['justtcg'::text, 'justtcg_fallback'::text, 'scryfall_fallback'::text, 'tcgdex_fallback'::text, 'cardmarket'::text, 'manual'::text, 'import'::text, 'bulk'::text, 'unpriced'::text]));
alter table public.buy_lines add constraint buy_lines_unpriced_check CHECK (price_source <> 'unpriced'::text OR unit_price = 0::numeric);

-- Where a card with no price may be: a project, or the system collections a project's export copies it into
-- (Can't upload cards, Bulk pulled from exports). One rule for every path that writes a line: a walk-in's add,
-- a collection's, an import, a copy, and Convert to buy moving a project's cards into a buy.
create function internal.unpriced_in_project()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if new.price_source = 'unpriced' and not exists (
       select 1 from buys b where b.id = new.buy_id and (b.project or b.system_key is not null)) then
    raise exception 'unpriced_cards';
  end if;
  return new;
end;
$function$;
revoke all on function internal.unpriced_in_project() from public, anon, authenticated, service_role;

create trigger buy_lines_unpriced_in_project before insert or update of price_source, buy_id on public.buy_lines
  for each row execute function internal.unpriced_in_project();

-- The switch is one of the project's details, in the Changelog as "skip pricing: off → on".
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
  v_skip   boolean;
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
  -- Skip pricing is true or false, and a project's only (decision 513).
  if p_fields ? 'skip_pricing' and jsonb_typeof(p_fields -> 'skip_pricing') is distinct from 'boolean' then
    raise exception 'bad_skip_pricing';
  end if;
  if not b.project and coalesce((p_fields ->> 'skip_pricing')::boolean, false) then
    raise exception 'skip_pricing_project';
  end if;
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_last4 := b.id_last4;
  v_cash := b.custom_cash_pct;
  v_credit := b.custom_credit_pct;
  v_auto := b.auto_rates;
  v_skip := b.skip_pricing;

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

  -- Skip pricing (decision 513): the cards added from now on go in with no price.
  if p_fields ? 'skip_pricing' then
    v_skip := coalesce((p_fields ->> 'skip_pricing')::boolean, false);
    if v_skip is distinct from b.skip_pricing then
      v_rows := v_rows || jsonb_build_object('field', 'skip pricing',
        'before', case when b.skip_pricing then 'on' else 'off' end, 'after', case when v_skip then 'on' else 'off' end);
      v_names := v_names || 'skip pricing'::text;
    end if;
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return;
  end if;

  update buys
     set customer_name = v_name, phone = v_phone, id_last4 = v_last4, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit, auto_rates = v_auto, skip_pricing = v_skip,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$function$;

-- A card added with no price shows none in the Changelog, not $0.
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
