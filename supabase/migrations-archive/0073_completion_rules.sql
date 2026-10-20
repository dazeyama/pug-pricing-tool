-- What becomes Completed, after the owner charted docs/AUTO_COMPLETE.md
-- (2026-10-18; decisions 294–296):
--
-- 1. Collections and projects never complete themselves. EXPORT stamps a
--    Paid/Ours collection's Magic cards (the ones not exported yet) and
--    leaves its status alone; Completed is set by hand, from Paid/Ours, like
--    any other status, and leaving it changes the status only (the export's
--    stamps and its Can't-upload copies stay). The owner: "collections should
--    never 'auto complete' themselves and instead should be moved to completed
--    manually always. It's just a state there".
-- 2. Mark as completed on a Magic buy strikes the cards it completes: "If a
--    magic buy is completed (instead of exported), something else has happened
--    to it." Mark Paid/Ours again restores the ones it struck. Pokémon is
--    unchanged: Complete day… and Mark as completed are its way of finishing.
-- 3. Convert to project skips Completed cards instead of refusing: the live
--    cards move to the project; a buy with Completed cards left stays on its
--    day with them (and its struck cards); a buy with none is deleted as before.

CREATE OR REPLACE FUNCTION public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_count  integer;
  v_lines  uuid[];
  v_cards  integer;
  v_market numeric;
  v_game   text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if v_game is null then
    raise exception 'bad_game';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  if p_complete then
    -- A Magic buy Completed instead of exported means something else happened
    -- to its cards (owner, 2026-10-18; decision 295): they're struck too, with
    -- struck_at = completed_at so Paid/Ours again knows which ones to restore.
    select array_agg(id) into v_lines from buy_lines
     where buy_id = b.id and game = p_game and completed_at is null and bulk_kind is null and struck_at is null;
    update buy_lines
       set completed_at = now(), completed_by = p_user,
           struck_at = case when p_game = 'mtg' then now() else struck_at end,
           struck_by = case when p_game = 'mtg' then p_user else struck_by end
     where id = any(coalesce(v_lines, '{}'::uuid[]));
  else
    -- COMPLETE's Sell Prices go with it (owner, 2026-10-09); the cards the
    -- completion struck come back.
    select array_agg(id) into v_lines from buy_lines
     where buy_id = b.id and game = p_game and completed_at is not null and cc_status is null;
    update buy_lines set struck_at = null, struck_by = null
     where id = any(coalesce(v_lines, '{}'::uuid[])) and struck_at = completed_at;
    update buy_lines set completed_at = null, completed_by = null, cc_sell_price = null, cc_sell_basis = null
     where id = any(coalesce(v_lines, '{}'::uuid[]));
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select sum(quantity), sum(unit_price * quantity) into v_cards, v_market
    from buy_lines where id = any(coalesce(v_lines, '{}'::uuid[]));
  perform buy_event(b, p_user, p_device,
    case when p_complete then 'buy_completed' else 'buy_uncompleted' end,
    buy_target_name(b.id), array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id and l.game = p_game)), '[]'::jsonb,
    case when p_complete
         then format('%s %s card%s marked Completed without exporting%s: left out of the search and the day''s export.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end,
                     case when p_game = 'mtg' then ', and struck' else '' end)
         else format('%s %s card%s marked Paid/Ours again.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end) end);
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  b        buys;
  p        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
  v_struck jsonb;
  v_gone   integer;
  v_keep   boolean;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  -- Completed cards are skipped, not a refusal (owner, 2026-10-18; decision 296):
  -- the live cards move; with Completed cards left, the buy stays on its day.
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) filter (where struck_at is null) as q,
                 sum(unit_price * quantity) filter (where struck_at is null) as m
            from buy_lines where buy_id = b.id and completed_at is null group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null;
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null;

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null, b.paid_price, b.paid_method, coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null;
  -- Projects are the store's own cards: no rates (owner, 2026-10-15).
  update buy_lines set custom_cash_pct = null, custom_credit_pct = null, cash_pct = null, credit_pct = null where buy_id = p.id;

  -- One entry: the cards added to the new project (owner, 2026-10-02).
  perform collection_event(p, p_user, p_device, 'buy_converted', coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = p.id))).cards, 0, internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)
             || case when v_gone > 0
                     then '; ' || internal.lines_count_text(array(select l from buy_lines l
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null),
                                                            'struck') || case when v_keep then ' stay on the buy' else ' left out' end
                     else '' end
             || case when v_keep then '; its Completed cards stay on the buy' else '' end));

  if v_keep then
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;
  else
    delete from buys where id = b.id;
  end if;
  return p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid)
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
begin
  if p_user is null then raise exception 'no_user'; end if;
  p_matches := coalesce(p_matches, '[]'::jsonb);
  p_cant := coalesce(p_cant, '{}'::uuid[]);
  if v_kind is null or v_kind not in ('day', 'buy', 'cant_upload', 'collection') then raise exception 'bad_target'; end if;
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
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now() where id = any(v_buys);

    -- Copies in Can't upload cards (spec 9.2), each saying which buy it's from,
    -- by the buy's number (0071).
    select jsonb_object_agg(l.id::text, format('from Buy %s · %s', buy_number(x), to_char(v_day, 'FMMonth FMDD, YYYY')))
      into v_notes
      from buy_lines l
      join buys x on x.id = l.buy_id
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
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set completed_at = now(), completed_by = p_user where id = any(v_lines);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;

    select jsonb_object_agg(l.id::text, 'from ' || v_target) into v_notes from buy_lines l where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_target, p_user, p_device);

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
             case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                  else '' end));

    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant,
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
    perform export_check(v_lines, p_matches, p_cant, v_file);

    perform export_stamp(p_matches, v_file, v_sku);
    update buy_lines set cc_status = 'cant_upload', cc_exported_at = now() where id = any(p_cant);
    perform export_learn(p_matches, p_set_maps, v_file, p_user);
    select jsonb_object_agg(l.id::text, 'from ' || v_from) into v_notes from buy_lines l where l.id = any(p_cant);
    perform cant_upload_copy(
      (select array_agg(l.id order by l.position) from buy_lines l where l.id = any(p_cant)),
      v_notes, v_from, p_user, p_device);

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
             case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                  else '' end));
    return jsonb_build_object('buys', 1, 'cards', v_cards, 'cant', v_cant,
                              'sku', case when v_cards > 0 then v_sku end, 'lines', coalesce(v_rows, '[]'::jsonb));
  end if;

  -- ------------------------------------------------- Can't upload cards (9.3)
  -- Cards that now match are exported and leave the collection, and their
  -- original lines are restamped exported; the rest stay, unchanged.
  b := collection_for_write(cant_upload_ensure(), p_device, (p_target ->> 'version')::integer, false);
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
  perform collection_event(b, p_user, p_device, 'cant_upload_exported', array['mtg'], 0, v_cards, null, v_lines_log,
    '[]', format('Exported %s card%s (Custom SKU %s)%s.', v_cards, case when v_cards = 1 then '' else 's' end, v_sku,
                 case when v_cant > 0 then format('; %s still can''t upload and stay', v_cant) else '' end));
  return jsonb_build_object('buys', 0, 'cards', v_cards, 'cant', v_cant, 'sku', v_sku,
                            'lines', coalesce(v_rows, '[]'::jsonb));
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric DEFAULT NULL::numeric, p_offer_credit numeric DEFAULT NULL::numeric, p_paid_price numeric DEFAULT NULL::numeric, p_paid_method text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  if p_status not in ('processing', 'priced', 'paid', 'completed', 'rejected') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- A project is only ever Paid/Ours, or Completed by EXPORT (owner, 2026-10-01).
  if b.project and p_status in ('processing', 'priced', 'rejected') then
    raise exception 'project_status';
  end if;
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;
  -- Rejected (owner, 2026-10-09): only from Processing or Priced, and only
  -- reopened back to where it was, Priced (with its offer) or Processing.
  if p_status = 'rejected' and v_was not in ('processing', 'priced') then
    raise exception 'reject_from';
  end if;
  if v_was = 'rejected' and p_status not in ('processing', 'priced') then
    raise exception 'rejected_reopen';
  end if;
  -- Completed is a status like the others (owner, 2026-10-18; decision 294):
  -- leaving it changes the status only. An export's stamps, and its copies in
  -- Can't upload cards, stay whatever the status does.
  v_cash := coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct'));
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct'));
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = p_buy_id;
  v_rows := jsonb_build_array(jsonb_build_object('field', 'status',
    'before', status_label(v_was), 'after', status_label(p_status)));

  if p_status = 'rejected' then
    -- The customer said no: locked, out of search, kept with its prices and
    -- offer until deleted (owner, 2026-10-09).
    -- Its rates are kept as they were, like Paid/Ours, so its totals read
    -- the same later whatever the Master Buy Percentages become.
    update buys
       set status = 'rejected', rejected_at = now(),
           rejected_reason = nullif(btrim(coalesce(p_reason, '')), ''),
           cash_pct = v_cash, credit_pct = v_credit,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.fix_line_rates(b);
    if b.rejected_reason is not null then
      v_rows := v_rows || jsonb_build_object('field', 'reason', 'before', null, 'after', b.rejected_reason);
    end if;
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
    v_summary := case when b.rejected_reason is not null
                      then sentence('Rejected: ' || b.rejected_reason)
                      else 'Rejected.' end;

  elsif v_was = 'rejected' then
    -- Reopened: back to Priced (the offer still stands) or Processing.
    if p_status = 'priced' and b.offer_cash is null then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = p_status, rejected_at = null, rejected_reason = null,
           cash_pct = null, credit_pct = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.unfix_line_rates(b.id);
    v_summary := sentence('Reopened: back to ' || status_label(p_status));

  elsif p_status = 'priced' and v_was = 'processing' then
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
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
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
    perform internal.fix_line_rates(b);
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
    v_totals := internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id));
    v_summary := format('Marked Paid/Ours: paid %s in %s, locked.', money_text(p_paid_price), p_paid_method);

  elsif p_status = 'completed' then
    -- By hand, from Paid/Ours (owner, 2026-10-18; decision 294): a collection
    -- is paid for before it's done with. EXPORT no longer sets it.
    if v_was <> 'paid' then
      raise exception 'complete_from_paid';
    end if;
    update buys
       set status = 'completed', completed_at = now(),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Marked Completed.';

  else
    -- Back to Priced or Processing: not paid after all. From Processing to
    -- Priced without an offer can't happen (handled above).
    update buys
       set status = p_status, paid_at = null, completed_at = null,
           cash_pct = null, credit_pct = null, paid_price = null, paid_method = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.unfix_line_rates(b.id);
    v_summary := case when v_was in ('paid', 'completed')
                      then sentence('Unlocked: back to ' || status_label(p_status))
                      else sentence('Marked ' || status_label(p_status)) end;
  end if;

  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, v_totals, '[]',
    v_rows, v_summary);
end;
$function$;
