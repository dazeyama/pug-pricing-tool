-- Export MTG csv (>$1) and Bulk pulled from exports (decision 406; the team's feedback item 6, the
-- owner's answers 2026-10-20): a >$1 export leaves the cards whose Sell Price is under $1.00 out of
-- the file. They're pulled from the batch like Can't upload cards and work the same way: the card is
-- stamped (cc_status 'pulled') and Completed with the export, frozen (decision 345), and copied to a
-- second system collection, "Bulk pulled from exports" (system_key 'pulled'), made when it's first
-- needed. Its cards export from there like Can't upload cards' (target kind 'pulled'), and Undo
-- export takes the copies back out. The app as pushed keeps working: export_lines' new p_pulled
-- defaults to none, and nothing else changes signature.

-- A card pulled under $1 is the third export stamp.
alter table public.buy_lines drop constraint buy_lines_cc_status_check;
alter table public.buy_lines add constraint buy_lines_cc_status_check
  CHECK (cc_status = ANY (ARRAY['exported'::text, 'cant_upload'::text, 'pulled'::text]));

-- The collection, made the first time a card is pulled (as cant_upload_ensure makes Can't upload cards).
create function public.pulled_ensure()
returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_id uuid;
begin
  select id into v_id from buys where system_key = 'pulled';
  if v_id is null then
    insert into buys (kind, status, customer_name, phone, notes, system_key, paid_at)
    values ('collection', 'paid', 'Bulk pulled from exports', null,
            'Cards under $1 pulled out of an Export MTG csv (>$1) batch. They stay here until they''re exported '
            || 'from here or deleted.', 'pulled', now())
    on conflict (system_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buys where system_key = 'pulled';
    end if;
  end if;
  return v_id;
end;
$$;
revoke all on function public.pulled_ensure() from public, anon;
grant execute on function public.pulled_ensure() to authenticated, service_role;

-- Copies of pulled cards, as cant_upload_copy makes Can't upload's.
CREATE FUNCTION internal.pulled_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid;
  b       buys;
  v_pos   integer;
  v_cards integer;
  v_lines jsonb;
begin
  if coalesce(array_length(p_lines, 1), 0) = 0 then return 0; end if;
  v_sys := pulled_ensure();
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
  perform collection_event(b, p_user, p_device, 'pulled_added', array['mtg'], v_cards, 0, null, v_lines, '[]',
    format('%s card%s from %s under $1, pulled from the export.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;
revoke all on function internal.pulled_copy(uuid[], jsonb, text, uuid, uuid) from public, anon;
grant execute on function internal.pulled_copy(uuid[], jsonb, text, uuid, uuid) to authenticated, service_role;

-- Undo export takes pulled copies back out, as cant_upload_return does Can't upload's.
CREATE FUNCTION internal.pulled_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid;
  b       buys;
  v_cards integer;
  v_lines jsonb;
begin
  select id into v_sys from buys where system_key = 'pulled';
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
  perform collection_event(b, p_user, p_device, 'pulled_returned', array['mtg'], 0, v_cards, null, v_lines, '[]',
    format('%s card%s taken back out: the export of %s was undone.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;
revoke all on function internal.pulled_return(uuid[], text, uuid, uuid) from public, anon;
grant execute on function internal.pulled_return(uuid[], text, uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------------------------ export_lines, with p_pulled
drop function public.export_lines(jsonb, jsonb, uuid[], jsonb, uuid, uuid);
CREATE FUNCTION public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid, p_pulled uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  v_target    text;
  v_market    numeric;
  v_pulled    integer := 0;
begin
  if p_user is null then raise exception 'no_user'; end if;
  p_matches := coalesce(p_matches, '[]'::jsonb);
  p_cant := coalesce(p_cant, '{}'::uuid[]);
  p_pulled := coalesce(p_pulled, '{}'::uuid[]);
  if v_kind is null or v_kind not in ('day', 'buy', 'cant_upload', 'pulled', 'collection') then raise exception 'bad_target'; end if;
  -- Only a buy, day or collection pulls cards (decision 406); the system collections' own exports don't.
  if v_kind in ('cant_upload', 'pulled') and cardinality(p_pulled) > 0 then raise exception 'bad_target'; end if;
  -- An inventory with products, when anything is to be matched (a collection
  -- with only Pokémon cards needs none).
  if jsonb_array_length(p_matches) > 0
     and (v_file is null or not exists (select 1 from cc_products where file_id = v_file)) then
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
    -- The Custom SKU is the day exported, not the day it's run (owner, 2026-10-17; 0071).
    v_sku := cc_custom_sku_day(v_day);

    -- The day's buys, locked, then those with this game's cards still Paid/Ours.
    perform 1 from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     for update;
    select array_agg(x.id) into v_buys
      from buys x
     where x.kind = 'walk_in' and x.status = 'confirmed'
       and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
       and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_game and l.completed_at is null
                     and l.bulk_kind is null and l.struck_at is null);
    if v_buys is null then raise exception 'nothing_to_export'; end if;
    -- Nothing changed since the dialog opened.
    if exists (select 1 from buys x where x.id = any(v_buys)
                and (p_target -> 'versions' ->> x.id::text)::integer is distinct from x.version)
       or (select count(*) from jsonb_object_keys(coalesce(p_target -> 'versions', '{}'::jsonb)))
          <> array_length(v_buys, 1) then
      raise exception 'stale_version';
    end if;
    select array_agg(l.id) into v_lines
      from buy_lines l where l.buy_id = any(v_buys) and l.game = v_game and l.completed_at is null
       and l.bulk_kind is null and l.struck_at is null;
    perform export_check(v_lines, p_matches, p_cant || p_pulled, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    update buy_lines set cc_status = 'pulled', cc_exported_at = now() where id = any(p_pulled);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now() where id = any(v_buys);

    -- Copies in Can't upload cards (spec 9.2), each saying which buy it's from,
    -- by the buy's number (0071).
    select jsonb_object_agg(l.id::text, format('from Buy %s · %s', buy_number(x), to_char(v_day, 'FMMonth FMDD, YYYY')))
      into v_notes
      from buy_lines l
      join buys x on x.id = l.buy_id
     where l.id = any(p_cant || p_pulled);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.buy_id, l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);
    perform internal.pulled_copy(
      (select array_agg(l.id order by l.buy_id, l.position) from buy_lines l where l.id = any(p_pulled)),
      v_notes, v_from, p_user, p_device);
    select coalesce(sum(quantity), 0) into v_pulled from buy_lines where id = any(p_pulled);

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
    perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
      p_target_name => v_from, p_games => array[v_game], p_day => v_day,
      p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
      p_summary => format('%s Magic card%s exported (Custom SKU %s)%s.', v_cards,
                          case when v_cards = 1 then '' else 's' end, v_sku,
                          case when v_pulled > 0 then format('; %s under $1 pulled, copied to Bulk pulled from exports', v_pulled) else '' end
             || case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                               else '' end));

    return jsonb_build_object('buys', array_length(v_buys, 1), 'cards', v_cards, 'cant', v_cant, 'pulled', coalesce(v_pulled, 0),
                              'sku', v_sku, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ---------------------------------------------- one walk-in buy (0041)
  -- "Export single buy…" (owner, 2026-10-09): one buy's Magic cards, now,
  -- today's too (a buy is whole once confirmed; the day's EXPORT waits for
  -- the day so no buy misses it). Exported as the day's EXPORT would, then
  -- only this buy is Completed, as Mark as completed leaves it: the rest of
  -- its day stays Paid/Ours, and the day's EXPORT skips it.
  if v_kind = 'buy' then
    v_game := p_target ->> 'game';
    if v_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
    if v_game is distinct from 'mtg' then raise exception 'bad_target'; end if;
    select * into b from buys
     where id = (p_target ->> 'buy_id')::uuid and kind = 'walk_in' and status = 'confirmed' for update;
    if b.id is null then raise exception 'buy_gone'; end if;
    if (p_target ->> 'version')::integer is distinct from b.version then raise exception 'stale_version'; end if;
    select array_agg(l.id) into v_lines
      from buy_lines l where l.buy_id = b.id and l.game = v_game and l.completed_at is null
       and l.bulk_kind is null and l.struck_at is null;
    if v_lines is null then raise exception 'nothing_to_export'; end if;
    v_target := buy_target_name(b.id);
    -- Its day's Custom SKU with its number: "101626-42" (owner, 2026-10-17; 0071).
    v_sku := cc_custom_sku_day((b.confirmed_at at time zone 'America/Los_Angeles')::date) || '-' || buy_number(b);
    perform export_check(v_lines, p_matches, p_cant || p_pulled, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    update buy_lines set cc_status = 'pulled', cc_exported_at = now() where id = any(p_pulled);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;

    select jsonb_object_agg(l.id::text, 'from ' || v_target) into v_notes from buy_lines l where l.id = any(p_cant || p_pulled);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_target, p_user, p_device);
    perform internal.pulled_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_pulled)),
      v_notes, v_target, p_user, p_device);
    select coalesce(sum(quantity), 0) into v_pulled from buy_lines where id = any(p_pulled);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0),
           coalesce(sum(unit_price * quantity), 0)
      into v_cards, v_cant, v_market
      from buy_lines where id = any(v_lines);
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(v_lines);

    perform buy_event(b, p_user, p_device, 'buy_exported', v_target, array[v_game], 0,
      internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
      format('%s Magic card%s exported on its own (Custom SKU %s)%s; the buy is Completed.', v_cards,
             case when v_cards = 1 then '' else 's' end, v_sku,
             case when v_pulled > 0 then format('; %s under $1 pulled, copied to Bulk pulled from exports', v_pulled) else '' end
             || case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                  else '' end));

    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant, 'pulled', coalesce(v_pulled, 0),
                              'sku', v_sku, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------------- a collection (E5)
  -- Paid/Ours only; its Magic cards not exported yet are exported, its Pokémon
  -- cards left as they are (owner, 2026-09-30). Its status doesn't move
  -- (owner, 2026-10-18; decision 294): Completed is set by hand.
  if v_kind = 'collection' then
    b := collection_for_write((p_target ->> 'buy_id')::uuid, p_device, (p_target ->> 'version')::integer, false);
    if b.system_key is not null then raise exception 'bad_target'; end if;
    if b.status <> 'paid' then raise exception 'collection_not_paid'; end if;
    v_from := b.customer_name;
    select array_agg(l.id) into v_lines from buy_lines l
     where l.buy_id = b.id and l.game = 'mtg' and l.bulk_kind is null and l.struck_at is null and l.cc_status is null;
    if v_lines is null then raise exception 'nothing_to_export'; end if;
    perform export_check(v_lines, p_matches, p_cant || p_pulled, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    update buy_lines set cc_status = 'pulled', cc_exported_at = now() where id = any(p_pulled);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    select jsonb_object_agg(l.id::text, 'from ' || v_from) into v_notes from buy_lines l where l.id = any(p_cant || p_pulled);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);
    perform internal.pulled_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_pulled)),
      v_notes, v_from, p_user, p_device);
    select coalesce(sum(quantity), 0) into v_pulled from buy_lines where id = any(p_pulled);

    select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
           coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0)
      into v_cards, v_cant
      from buy_lines where id = any(coalesce(v_lines, '{}'::uuid[]));
    select jsonb_agg(jsonb_build_object(
             'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
             'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
             'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price, 'cc_custom_sku', l.cc_custom_sku))
      into v_rows
      from buy_lines l where l.id = any(coalesce(v_lines, '{}'::uuid[]));

    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;
    perform collection_event(b, p_user, p_device, 'collection_exported', array['mtg'], 0, 0, null, '[]', '[]',
      format('Exported %s card%s (Custom SKU %s)%s.', v_cards,
             case when v_cards = 1 then '' else 's' end, v_sku,
             case when v_pulled > 0 then format('; %s under $1 pulled, copied to Bulk pulled from exports', v_pulled) else '' end
             || case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                  else '' end));
    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant, 'pulled', coalesce(v_pulled, 0),
                              'sku', case when v_cards > 0 then v_sku end, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------ Bulk pulled from exports (decision 406)
  -- As Can't upload cards: cards that now match are exported and leave the collection, their
  -- originals restamped exported; the rest stay.
  if v_kind = 'pulled' then
    -- Cards that now match are exported and leave the collection, and their
    -- original lines are restamped exported; the rest stay, unchanged.
    b := collection_for_write(pulled_ensure(), p_device, (p_target ->> 'version')::integer, false);
    select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg' and l.bulk_kind is null and l.struck_at is null;
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
    perform collection_event(b, p_user, p_device, 'pulled_exported', array['mtg'], 0, v_cards, null, v_lines_log,
      '[]', format('Exported %s card%s (Custom SKU %s)%s.', v_cards, case when v_cards = 1 then '' else 's' end, v_sku,
                   case when v_cant > 0 then format('; %s didn''t match and stay', v_cant) else '' end));
    return jsonb_build_object('buys', 0, 'cards', v_cards, 'cant', v_cant, 'sku', v_sku,
                              'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------- Can't upload cards (9.3)
  -- Cards that now match are exported and leave the collection, and their
  -- original lines are restamped exported; the rest stay, unchanged.
  b := collection_for_write(cant_upload_ensure(), p_device, (p_target ->> 'version')::integer, false);
  select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg' and l.bulk_kind is null and l.struck_at is null;
  if v_lines is null then raise exception 'nothing_to_export'; end if;
  perform export_check(v_lines, p_matches, p_cant || p_pulled, v_file);
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
                 case when v_pulled > 0 then format('; %s under $1 pulled, copied to Bulk pulled from exports', v_pulled) else '' end
             || case when v_cant > 0 then format('; %s still can''t upload and stay', v_cant) else '' end));
  return jsonb_build_object('buys', 0, 'cards', v_cards, 'cant', v_cant, 'pulled', coalesce(v_pulled, 0), 'sku', v_sku,
                            'lines', coalesce(v_rows, '[]'::jsonb));
end;
$function$;
revoke all on function public.export_lines(jsonb, jsonb, uuid[], jsonb, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.export_lines(jsonb, jsonb, uuid[], jsonb, uuid, uuid, uuid[]) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.export_undo_day(p_day date, p_game text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
     and l.game = p_game and l.completed_at is not null
     -- Not the Magic cards Mark as completed struck: they went elsewhere (decision 340).
     and l.struck_at is distinct from l.completed_at;
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
  -- Pulled cards' copies come back out too (decision 406).
  v_returned := v_returned + internal.pulled_return(v_lines, v_from, p_user, p_device);

  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
    p_target_name => v_from, p_games => array[p_game], p_day => p_day,
    p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
    p_summary => format('%s %s buy%s marked Paid/Ours again%s.', v_count, v_game,
                        case when v_count = 1 then '' else 's' end,
                        case when v_returned > 0
                             then format('; %s card%s taken back out of Can''t upload cards or Bulk pulled from exports', v_returned,
                                         case when v_returned = 1 then '' else 's' end)
                             else '' end));
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_count    integer;
  v_cards    integer;
  v_market   numeric;
  v_returned integer;
  v_target   text;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null then raise exception 'bad_game'; end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then raise exception 'buy_gone'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'stale_version'; end if;

  select array_agg(id), count(*) into v_lines, v_count
    from buy_lines where buy_id = b.id and game = p_game and completed_at is not null
     -- Not the Magic cards Mark as completed struck: they went elsewhere (decision 340).
     and struck_at is distinct from completed_at;
  if v_lines is null then return 0; end if;
  v_target := buy_target_name(b.id);

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, v_target, p_user, p_device);
  -- Pulled cards' copies come back out too (decision 406).
  v_returned := v_returned + internal.pulled_return(v_lines, v_target, p_user, p_device);

  select coalesce(sum(quantity), 0), coalesce(sum(unit_price * quantity), 0) into v_cards, v_market
    from buy_lines where id = any(v_lines);
  perform buy_event(b, p_user, p_device, 'buy_unexported', v_target, array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
    format('%s %s card%s marked Paid/Ours again%s.', v_cards, v_game, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s card%s taken back out of Can''t upload cards or Bulk pulled from exports', v_returned,
                            case when v_returned = 1 then '' else 's' end)
                else '' end));
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_cards    integer;
  v_returned integer;
  v_skus     text;
begin
  if p_user is null then raise exception 'no_user'; end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- Can't upload cards' own export moves its copies out; there's nothing here to undo.
  if b.system_key is not null then raise exception 'system_collection'; end if;
  select array_agg(id), sum(quantity), string_agg(distinct cc_custom_sku, ', ')
    into v_lines, v_cards, v_skus
    from buy_lines where buy_id = b.id and cc_status is not null;
  if v_lines is null then raise exception 'nothing_to_undo'; end if;

  update buy_lines set
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, b.customer_name, p_user, p_device);
  -- Pulled cards' copies come back out too (decision 406).
  v_returned := v_returned + internal.pulled_return(v_lines, b.customer_name, p_user, p_device);

  perform collection_event(b, p_user, p_device, 'collection_unexported', array['mtg'], 0, 0, null, '[]', '[]',
    format('Export undone%s: %s card%s no longer marked exported%s.',
           case when v_skus is not null then ' (Custom SKU ' || v_skus || ')' else '' end,
           v_cards, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s taken back out of Can''t upload cards or Bulk pulled from exports', v_returned)
                else '' end));
  return jsonb_build_object('cards', v_cards, 'returned', v_returned);
end;
$function$;
