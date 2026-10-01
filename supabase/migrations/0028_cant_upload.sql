-- Export Phase E4 (docs/EXPORT_FUNCTION.md 6.5, 9): the "Can't upload cards"
-- collection. A permanent collection, created here, that holds a copy of every
-- card an export couldn't place, so the physical card has somewhere to live.
-- It can't be renamed, edited, re-statused or deleted, and cards only arrive
-- from exports; they can be removed as from any Paid/Ours collection.

alter table public.buys add column system_key text unique;
alter table public.buys drop constraint buys_collection_needs_name_phone;
alter table public.buys add constraint buys_collection_needs_name_phone check (
  kind <> 'collection' or (customer_name is not null and (phone is not null or system_key is not null)));

-- Where a copy in Can't upload cards came from: "from Buy 4 · September 30, 2026".
alter table public.buy_lines add column source_note text;

-- The collection's fixed note (spec 9.1).
create or replace function public.cant_upload_note() returns text
language sql immutable
set search_path = public
as $$
  select 'Cards that couldn''t be matched to a Crystal Commerce product during an export. Pull them out of the '
      || 'upload batch. They stay here until they''re exported from here or deleted.';
$$;

-- The collection's id, creating it if it's missing (a restore of a backup
-- made before it existed).
create or replace function public.cant_upload_ensure() returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from buys where system_key = 'cant_upload';
  if v_id is null then
    insert into buys (kind, status, customer_name, phone, notes, system_key, paid_at)
    values ('collection', 'paid', 'Can''t upload cards', null, cant_upload_note(), 'cant_upload', now())
    on conflict (system_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buys where system_key = 'cant_upload';
    end if;
  end if;
  return v_id;
end;
$$;

select public.cant_upload_ensure();

-- A Magic line as the app writes it (lineText): "1 Scrubland (3ED) 285 *F* [MP]".
create or replace function public.export_line_text(l buy_lines, p_qty integer default null) returns text
language sql stable
set search_path = public
as $$
  select concat_ws(' ',
    coalesce(p_qty, l.quantity) || ' ' || coalesce(l.name_en, l.name) || ' (' || l.set_code || ') ' || l.collector_number,
    case l.finish when 'foil' then '*F*' when 'etched' then '*E*' end,
    case when l.condition <> 'NM' then '[' || l.condition || ']' end);
$$;

-- ---------------------------------------------------------------------------
-- The refusals (spec 9.1): system_collection. Adding, editing and detail
-- changes go through collection_for_write with p_content; a status change and
-- a delete are checked in their own functions. Removing cards stays allowed.
-- (Each is the latest definition, 0011 / 0008, with the check added.)
-- ---------------------------------------------------------------------------
create or replace function public.collection_for_write(
  p_buy_id           uuid,
  p_device           uuid,
  p_expected_version integer,
  p_content          boolean
) returns buys
language plpgsql
set search_path = public
as $$
declare
  b      buys;
  v_lock collection_locks;
begin
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  -- Can't upload cards: no adding, editing or detail changes (spec 9.1).
  if p_content and b.system_key is not null then
    raise exception 'system_collection';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is null or v_lock.device_id is distinct from p_device then
    raise exception 'not_lock_holder';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  if p_content and b.status = 'paid' then
    raise exception 'collection_paid';
  end if;
  if p_content and b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$$;

create or replace function public.collection_set_status(
  p_buy_id           uuid,
  p_status           text,
  p_user             uuid,
  p_device           uuid,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer,
  p_offer_cash       numeric default null,
  p_offer_credit     numeric default null,
  p_paid_price       numeric default null,
  p_paid_method      text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_was    text;
  v_cash   numeric;
  v_credit numeric;
  v_market numeric;
  v_rows   jsonb;
  v_totals jsonb := null;
  v_summary text;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards is always Paid/Ours (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  if p_status not in ('processing', 'priced', 'paid', 'completed') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;
  v_cash := coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct'));
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct'));
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = p_buy_id;
  v_rows := jsonb_build_array(jsonb_build_object('field', 'status',
    'before', status_label(v_was), 'after', status_label(p_status)));

  if p_status = 'priced' and v_was = 'processing' then
    if p_offer_cash is null or p_offer_cash < 0 then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = 'priced', offer_cash = p_offer_cash,
           offer_credit = coalesce(p_offer_credit,
             case when v_cash > 0 then round_down_price(p_offer_cash * v_credit / v_cash) end),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'offer', 'before', null,
      'after', concat_ws(' / ', money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));
    v_totals := collection_totals(b, v_market);
    v_summary := sentence('Marked Priced: offered ' || concat_ws(' / ',
      money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));

  elsif p_status = 'paid' and v_was = 'completed' then
    -- Reopened: back to Paid/Ours, still locked, with what was paid.
    update buys
       set status = 'paid', completed_at = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Reopened: back to Paid/Ours, still locked.';

  elsif p_status = 'paid' then
    if p_paid_price is null or p_paid_price < 0 then
      raise exception 'paid_price_needed';
    end if;
    if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
      raise exception 'paid_method_needed';
    end if;
    update buys
       set status = 'paid', paid_at = now(), completed_at = null,
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
    v_totals := collection_totals(b, v_market);
    v_summary := format('Marked Paid/Ours: paid %s in %s, locked.', money_text(p_paid_price), p_paid_method);

  elsif p_status = 'completed' then
    if v_was <> 'paid' then
      raise exception 'complete_after_paid';
    end if;
    update buys
       set status = 'completed', completed_at = now(),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Marked Completed: its cards have moved on.';

  else
    -- Back to Priced or Processing: not paid after all. From Processing to
    -- Priced without an offer can't happen (handled above).
    update buys
       set status = p_status, paid_at = null, completed_at = null,
           cash_pct = null, credit_pct = null, paid_price = null, paid_method = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := case when v_was in ('paid', 'completed')
                      then sentence('Unlocked: back to ' || status_label(p_status))
                      else sentence('Marked ' || status_label(p_status)) end;
  end if;

  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, v_totals, '[]',
    v_rows, v_summary);
end;
$$;

create or replace function public.collection_delete(
  p_buy_id     uuid,
  p_user       uuid,
  p_device     uuid,
  p_typed_name text,
  p_line_texts jsonb default '{}'
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_lock   collection_locks;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards can't be deleted (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(b.customer_name)) then
    raise exception 'name_mismatch';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is not null and v_lock.device_id is distinct from p_device
     and v_lock.heartbeat_at > now() - interval '60 seconds' then
    raise exception 'locked_elsewhere';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p_buy_id group by game) t;

  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p_buy_id;

  perform collection_event(b, p_user, p_device, 'collection_deleted', coalesce(v_games, '{}'),
    0, coalesce(v_count, 0), collection_totals(b, coalesce(v_market, 0)), coalesce(v_lines, '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', null),
      jsonb_build_object('field', 'phone', 'before', format_phone(b.phone), 'after', null)),
    sentence(format('Collection deleted with %s card%s', coalesce(v_count, 0),
                    case when coalesce(v_count, 0) = 1 then '' else 's' end)));

  delete from buys where id = p_buy_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The export's shared steps.
-- ---------------------------------------------------------------------------

-- Every line of the target given exactly once, matched or can't upload;
-- every product in the current inventory; every Sell Price at the floor or
-- more. Raises stale_version / stale_inventory / bad_price.
create or replace function public.export_check(
  p_lines   uuid[],
  p_matches jsonb,
  p_cant    uuid[],
  p_file    uuid
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_given uuid[];
begin
  select array_agg(x) into v_given from (
    select (e ->> 'line_id')::uuid as x from jsonb_array_elements(p_matches) e
    union all
    select unnest(p_cant)) s;
  if p_lines is null or v_given is null
     or array_length(v_given, 1) <> (select count(distinct x) from unnest(v_given) x)
     or not (v_given @> p_lines and p_lines @> v_given) then
    raise exception 'stale_version';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where not exists (select 1 from cc_products p
                                 where p.file_id = p_file and p.product_id = e ->> 'product_id')) then
    raise exception 'stale_inventory';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0.40) then
    raise exception 'bad_price';
  end if;
end;
$$;

-- Stamp the matched lines (spec 6.4): the product copied from the inventory,
-- the condition word, the Sell Price and its basis, the Custom SKU.
create or replace function public.export_stamp(
  p_matches jsonb,
  p_file    uuid,
  p_sku     text
) returns void
language sql
set search_path = public
as $$
  update buy_lines l set
    cc_status       = 'exported',
    cc_product_id   = p.product_id,
    cc_product_name = p.product_name,
    cc_category     = p.category,
    cc_condition    = cc_condition_word(l.condition),
    cc_sell_price   = round((e ->> 'sell_price')::numeric, 2),
    cc_sell_basis   = e -> 'sell_basis',
    cc_custom_sku   = p_sku,
    cc_exported_at  = now()
  from jsonb_array_elements(p_matches) e
  join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
  where l.id = (e ->> 'line_id')::uuid;
$$;

-- What staff taught the matcher, and the automatic matches that exported.
create or replace function public.export_learn(
  p_matches  jsonb,
  p_set_maps jsonb,
  p_file     uuid,
  p_user     uuid
) returns void
language plpgsql
set search_path = public
as $$
begin
  insert into cc_product_links (scryfall_id, finish, product_id, product_name, category, source, linked_at, linked_by)
  select distinct on (l.scryfall_id, l.finish)
         l.scryfall_id, l.finish, p.product_id, p.product_name, p.category, e ->> 'link', now(), p_user
    from jsonb_array_elements(p_matches) e
    join buy_lines l on l.id = (e ->> 'line_id')::uuid
    join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
   where e ->> 'link' in ('staff', 'auto')
     and l.scryfall_id is not null and l.finish in ('nonfoil', 'foil', 'etched')
   order by l.scryfall_id, l.finish, (e ->> 'link') = 'staff' desc
  on conflict (scryfall_id, finish) do update set
    product_id = excluded.product_id, product_name = excluded.product_name, category = excluded.category,
    source = excluded.source, linked_at = excluded.linked_at, linked_by = excluded.linked_by;
  insert into cc_set_map (scryfall_set, promo_kind, category, source, updated_at, updated_by)
  select distinct on (lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''))
         lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''), s ->> 'category', 'staff', now(), p_user
    from jsonb_array_elements(coalesce(p_set_maps, '[]'::jsonb)) s
   where coalesce(s ->> 'scryfall_set', '') <> ''
     and coalesce(s ->> 'promo_kind', '') in ('', 'prerelease', 'promopack')
     and exists (select 1 from cc_products p where p.file_id = p_file and p.category = s ->> 'category')
  on conflict (scryfall_set, promo_kind) do update set
    category = excluded.category, source = 'staff', updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$$;

-- Copy can't-upload lines into Can't upload cards (spec 9.2), each with
-- where it came from. p_notes: { <line id>: "from Buy 4 · September 30, 2026" }.
-- Logs cant_upload_added. Returns how many cards were copied.
create or replace function public.cant_upload_copy(
  p_lines  uuid[],
  p_notes  jsonb,
  p_from   text,
  p_user   uuid,
  p_device uuid
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_sys   uuid := cant_upload_ensure();
  b       buys;
  v_pos   integer;
  v_cards integer;
  v_lines jsonb;
begin
  if coalesce(array_length(p_lines, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select coalesce(max(position), 0) into v_pos from buy_lines where buy_id = v_sys;
  insert into buy_lines (buy_id, position, game, lang, name, name_key, set_code, set_name, source_set_id,
                         collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
                         quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
                         scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id,
                         image_url, name_en, source_line_id, source_note)
  select v_sys, v_pos + row_number() over (order by k.ord), l.game, l.lang, l.name, l.name_key, l.set_code,
         l.set_name, l.source_set_id, l.collector_number, l.printed_size, l.rarity, l.finish, l.first_edition,
         l.treatments, l.condition, l.quantity, l.unit_price, l.market_price, l.price_source, l.price_snapshot,
         l.priced_at, l.scryfall_id, l.oracle_id, l.tcgdex_id, l.tcgplayer_id, l.justtcg_card_id,
         l.justtcg_variant_id, l.image_url, l.name_en, l.id, p_notes ->> l.id::text
    from unnest(p_lines) with ordinality as k(id, ord)
    join buy_lines l on l.id = k.id;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '+', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.id = any(p_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'cant_upload_added', array['mtg'], v_cards, 0, null, v_lines, '[]',
    format('%s card%s from %s couldn''t be matched to Crystal Commerce.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$$;

-- Take copies back out of Can't upload cards (an undo, spec 9.4): the copies
-- of these original lines. Logs cant_upload_returned. Returns the cards.
create or replace function public.cant_upload_return(
  p_originals uuid[],
  p_from      text,
  p_user      uuid,
  p_device    uuid
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_sys   uuid;
  b       buys;
  v_cards integer;
  v_lines jsonb;
begin
  select id into v_sys from buys where system_key = 'cant_upload';
  if v_sys is null or coalesce(array_length(p_originals, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '-', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.buy_id = v_sys and l.source_line_id = any(p_originals);
  if coalesce(v_cards, 0) = 0 then return 0; end if;
  delete from buy_lines where buy_id = v_sys and source_line_id = any(p_originals);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'cant_upload_returned', array['mtg'], 0, v_cards, null, v_lines, '[]',
    format('%s card%s taken back out: the export of %s was undone.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$$;

-- ---------------------------------------------------------------------------
-- export_lines (0027), now also copying can't-upload cards into Can't upload
-- cards, and exporting from it (target { kind: 'cant_upload', version }).
-- ---------------------------------------------------------------------------
create or replace function public.export_lines(
  p_target   jsonb,
  p_matches  jsonb,
  p_cant     uuid[],
  p_set_maps jsonb,
  p_user     uuid,
  p_device   uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_kind      text := p_target ->> 'kind';
  v_day       date;
  v_game      text;
  v_file      uuid := cc_current_file();
  v_sku       text := cc_custom_sku(now());
  v_from      text;
  v_buys      uuid[];
  v_lines     uuid[];
  v_cards     integer;
  v_cant      integer;
  v_rows      jsonb;
  v_notes     jsonb;
  v_lines_log jsonb;
  v_user      staff_users;
  b           buys;
begin
  if p_user is null then raise exception 'no_user'; end if;
  p_matches := coalesce(p_matches, '[]'::jsonb);
  p_cant := coalesce(p_cant, '{}'::uuid[]);
  if v_kind is null or v_kind not in ('day', 'cant_upload') then raise exception 'bad_target'; end if;
  if v_file is null or not exists (select 1 from cc_products where file_id = v_file) then
    raise exception 'no_inventory';
  end if;

  -- ------------------------------------------------------------- a day page
  if v_kind = 'day' then
    v_day := (p_target ->> 'day')::date;
    v_game := p_target ->> 'game';
    -- Magic only (owner, 2026-09-30; spec 1.3).
    if v_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
    if v_game is distinct from 'mtg' or v_day is null then raise exception 'bad_day'; end if;
    -- Today can't be exported (owner, 2026-09-30).
    if v_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;
    v_from := 'Magic · ' || to_char(v_day, 'FMMonth FMDD, YYYY');

    -- The day's buys, locked, then those with this game's cards still Paid/Ours.
    perform 1 from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     for update;
    select array_agg(x.id) into v_buys
      from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
       and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_game and l.completed_at is null);
    if v_buys is null then raise exception 'nothing_to_export'; end if;
    -- Nothing changed since the dialog opened.
    if exists (select 1 from buys x where x.id = any(v_buys)
                and (p_target -> 'versions' ->> x.id::text)::integer is distinct from x.version)
       or (select count(*) from jsonb_object_keys(coalesce(p_target -> 'versions', '{}'::jsonb)))
          <> array_length(v_buys, 1) then
      raise exception 'stale_version';
    end if;
    select array_agg(l.id) into v_lines
      from buy_lines l where l.buy_id = any(v_buys) and l.game = v_game and l.completed_at is null;
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now() where id = any(v_buys);

    -- Copies in Can't upload cards (spec 9.2), each saying which buy it's from,
    -- numbered as the day page numbers them.
    select jsonb_object_agg(l.id::text, format('from Buy %s · %s', n.n, to_char(v_day, 'FMMonth FMDD, YYYY')))
      into v_notes
      from buy_lines l
      join (select x.id, row_number() over (order by x.confirmed_at, x.id) as n
              from buys x
             where x.kind = 'walk_in' and x.status = 'confirmed'
               and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
               and exists (select 1 from buy_lines y where y.buy_id = x.id and y.game = v_game)) n
        on n.id = l.buy_id
     where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.buy_id, l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0)
      into v_cards, v_cant
      from buy_lines where id = any(v_lines);
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(v_lines);

    select * into v_user from staff_users where id = p_user;
    insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                        target_name, games, day, fields, summary)
    values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
            v_from, array[v_game], v_day,
            jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
            format('%s Magic card%s exported (Custom SKU %s)%s.', v_cards,
                   case when v_cards = 1 then '' else 's' end, v_sku,
                   case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                        else '' end));

    return jsonb_build_object('buys', array_length(v_buys, 1), 'cards', v_cards, 'cant', v_cant,
                              'sku', v_sku, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------- Can't upload cards (9.3)
  -- Cards that now match are exported and leave the collection, and their
  -- original lines are restamped exported; the rest stay, unchanged.
  b := collection_for_write(cant_upload_ensure(), p_device, (p_target ->> 'version')::integer, false);
  select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg';
  if v_lines is null then raise exception 'nothing_to_export'; end if;
  perform export_check(v_lines, p_matches, p_cant, v_file);
  if jsonb_array_length(p_matches) = 0 then
    return jsonb_build_object('buys', 0, 'cards', 0,
      'cant', (select coalesce(sum(quantity), 0) from buy_lines where id = any(p_cant)),
      'sku', v_sku, 'lines', '[]'::jsonb);
  end if;

  perform export_stamp(p_matches, v_file, v_sku);
  perform export_learn(p_matches, p_set_maps, v_file, p_user);
  -- The file's rows, and the changelog's lines, before the copies go.
  select coalesce(sum(l.quantity), 0),
         jsonb_agg(jsonb_build_object(
           'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
           'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
           'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku)),
         jsonb_agg(jsonb_build_object('sign', '-', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_rows, v_lines_log
    from buy_lines l where l.buy_id = b.id and l.cc_status = 'exported';
  -- The originals (still in their buys or collections) are exported now: the
  -- Can't upload chip goes.
  update buy_lines o set
    cc_status = 'exported', cc_product_id = c.cc_product_id, cc_product_name = c.cc_product_name,
    cc_category = c.cc_category, cc_condition = c.cc_condition, cc_sell_price = c.cc_sell_price,
    cc_sell_basis = c.cc_sell_basis, cc_custom_sku = c.cc_custom_sku, cc_exported_at = c.cc_exported_at
  from buy_lines c
  where c.buy_id = b.id and c.cc_status = 'exported' and o.id = c.source_line_id;
  -- Their buys or collections reload where they're open.
  update buys set version = version + 1, updated_at = now()
   where id in (select o.buy_id from buy_lines o join buy_lines c on o.id = c.source_line_id
                 where c.buy_id = b.id and c.cc_status = 'exported');
  delete from buy_lines where buy_id = b.id and cc_status = 'exported';
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  select coalesce(sum(quantity), 0) into v_cant from buy_lines where id = any(p_cant);
  perform collection_event(b, p_user, p_device, 'cant_upload_exported', array['mtg'], 0, v_cards, null, v_lines_log,
    '[]', format('Exported %s card%s (Custom SKU %s)%s.', v_cards, case when v_cards = 1 then '' else 's' end, v_sku,
                 case when v_cant > 0 then format('; %s still can''t upload and stay', v_cant) else '' end));
  return jsonb_build_object('buys', 0, 'cards', v_cards, 'cant', v_cant, 'sku', v_sku,
                            'lines', coalesce(v_rows, '[]'::jsonb));
end;
$$;

-- ---------------------------------------------------------------------------
-- export_undo_day (0027), now also taking the day's copies back out of Can't
-- upload cards (owner: "undo the move", spec 9.4).
-- ---------------------------------------------------------------------------
create or replace function public.export_undo_day(
  p_day    date,
  p_game   text,
  p_user   uuid,
  p_device uuid
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user     staff_users;
  v_ids      uuid[];
  v_lines    uuid[];
  v_count    integer;
  v_returned integer;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
  v_from     text;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  v_from := v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY');

  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
   for update;
  select array_agg(distinct b.id), array_agg(l.id) into v_ids, v_lines
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is not null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);
  v_returned := cant_upload_return(v_lines, v_from, p_user, p_device);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
          v_from, array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
          format('%s %s buy%s marked Paid/Ours again%s.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end,
                 case when v_returned > 0
                      then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                                  case when v_returned = 1 then '' else 's' end)
                      else '' end));
  return v_count;
end;
$$;

revoke execute on function
  public.cant_upload_note(), public.cant_upload_ensure(), public.export_line_text(buy_lines, integer),
  public.export_check(uuid[], jsonb, uuid[], uuid), public.export_stamp(jsonb, uuid, text),
  public.export_learn(jsonb, jsonb, uuid, uuid), public.cant_upload_copy(uuid[], jsonb, text, uuid, uuid),
  public.cant_upload_return(uuid[], text, uuid, uuid)
from public, anon;
grant execute on function
  public.cant_upload_note(), public.cant_upload_ensure(), public.export_line_text(buy_lines, integer),
  public.export_check(uuid[], jsonb, uuid[], uuid), public.export_stamp(jsonb, uuid, text),
  public.export_learn(jsonb, jsonb, uuid, uuid), public.cant_upload_copy(uuid[], jsonb, text, uuid, uuid),
  public.cant_upload_return(uuid[], text, uuid, uuid)
to authenticated;
