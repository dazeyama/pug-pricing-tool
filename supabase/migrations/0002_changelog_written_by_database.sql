-- The Changelog is written only by the database (decision 378; the plan: decision 274's
-- step 2, SQUASH.md section 11a). Every entry was inserted as the signed-in role, through
-- the `insert` grant on events and the policy "store: append", which also let a browser
-- write entries of its own. Now one security-definer helper, internal.insert_event, does
-- every insert, and the signed-in role can only read the Changelog:
--   events: insert, update, delete, truncate, references, trigger and maintain revoked
--     from authenticated (select stays: the Changelog page reads it); the policy
--     "store: append" dropped (service_role keeps what it had);
--   events_seq_seq: all revoked from authenticated (only inserts used it);
--   internal.buy_event, internal.collection_event, public.buy_log_cash_download,
--     public.confirm_buy, public.day_complete, public.export_lines,
--     public.export_undo_day and public.project_to_buy: the one `insert into events …
--     values (…)` in each becomes `perform internal.insert_event(…)` with the same
--     values; nothing else in them changes;
--   public.restore_backup already runs with the owner's rights and keeps its insert.
-- Same signatures: the app as pushed keeps working (it has not inserted into events
-- itself since 0064).

-- The one writer. Owner's rights, so the insert passes with the grant gone; the fixed
-- search path is the security-definer one. Missing parts default as the old inserts did.
create function internal.insert_event(
  p_user uuid, p_user_name text, p_user_color text, p_device uuid, p_kind text, p_action text,
  p_target_id uuid default null, p_target_name text default null, p_games text[] default '{}',
  p_added integer default 0, p_removed integer default 0, p_totals jsonb default null,
  p_lines jsonb default '[]', p_fields jsonb default '[]', p_summary text default '', p_day date default null)
returns void
language sql
security definer
set search_path = public, internal, pg_temp
as $$
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, removed, totals, lines, fields, summary, day)
  values (p_user, p_user_name, p_user_color, p_device, p_kind, p_action,
          p_target_id, p_target_name, coalesce(p_games, '{}'), coalesce(p_added, 0), coalesce(p_removed, 0),
          p_totals, coalesce(p_lines, '[]'::jsonb), coalesce(p_fields, '[]'::jsonb), coalesce(p_summary, ''), p_day);
$$;
-- As every internal helper: never PUBLIC or anon.
revoke all on function internal.insert_event(uuid, text, text, uuid, text, text, uuid, text, text[], integer, integer, jsonb, jsonb, jsonb, text, date) from public, anon;
grant execute on function internal.insert_event(uuid, text, text, uuid, text, text, uuid, text, text[], integer, integer, jsonb, jsonb, jsonb, text, date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', p_action,
    p_target_id => b.id, p_target_name => p_target, p_games => p_games, p_removed => p_removed,
    p_totals => p_totals, p_lines => p_lines, p_summary => p_summary);
end;
$function$;

CREATE OR REPLACE FUNCTION internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'collection', p_action,
    p_target_id => b.id, p_target_name => b.customer_name, p_games => p_games, p_added => p_added,
    p_removed => p_removed, p_totals => p_totals, p_lines => p_lines, p_fields => p_fields, p_summary => p_summary);
end;
$function$;

CREATE OR REPLACE FUNCTION public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
  v_month date := date_trunc('month', p_month)::date;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'cash_buys_downloaded',
    p_target_name => 'Cash buys · ' || to_char(v_month, 'FMMonth YYYY'), p_day => v_month, p_summary => p_summary);
end;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb DEFAULT '{}'::jsonb, p_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_cash     numeric;
  v_credit   numeric;
  v_games    text[];
  v_count    integer;
  v_market   numeric;
  v_number   integer;
  v_day      date;
  v_target   text;
  v_customer text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_from     text;
  v_lines    jsonb;
  v_user     staff_users;
begin
  -- Name, phone and the price paid are all required (owner, 2026-09-30).
  if v_customer is null then
    raise exception 'name_needed';
  end if;
  -- 10 digits; a leading 1 (the country code) is dropped (spec 9.3).
  if v_phone ~ '^1[0-9]{10}$' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone is null then
    raise exception 'phone_needed';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if p_paid_price is null or p_paid_price < 0 then
    raise exception 'paid_price_needed';
  end if;
  if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
    raise exception 'paid_method_needed';
  end if;

  select * into b from buys where id = p_buy_id for update;
  if b.id is null or b.status <> 'draft' then
    raise exception 'stale_version';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p_buy_id group by game) t;
  if coalesce(v_count, 0) = 0 then
    raise exception 'empty_buy';
  end if;

  -- The rates it was priced at: its custom ones where set, else the master ones
  -- the screen showed (owner, 2026-10-16: kept, not forgotten).
  v_cash   := coalesce(b.custom_cash_pct, p_cash_pct);
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct);

  -- Its number, the next ever (0071): the same count for both games, every day.
  update buys
     set status = 'confirmed', confirmed_at = now(), confirmed_by = p_user,
         number = coalesce(number, internal.next_buy_number()),   -- the highest + 1 (decision 349)
         customer_name = v_customer, phone = v_phone, notes = coalesce(btrim(p_notes), ''),
         cash_pct = v_cash, credit_pct = v_credit,
         paid_price = p_paid_price, paid_method = p_paid_method, paid_at = now(),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;
  -- Each card's rate as it was priced, its own included, kept on it (docs/TEAM_FEEDBACK.md 4.6).
  perform internal.fix_line_rates(b);
  -- Its scans not added by now are left out, and the phone says so (decision 350).
  perform internal.scans_finished(b.draft_device_id, b.id,
    format('Buy %s was confirmed first: scan it again for the next buy', b.number));

  v_day := (now() at time zone 'America/Los_Angeles')::date;
  v_number := b.number;
  v_target := format('Buy %s · %s', v_number, to_char(v_day, 'Dy Mon FMDD, YYYY'));

  select jsonb_agg(jsonb_build_object(
           'sign', '+', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p_buy_id;

  select * into v_user from staff_users where id = p_user;

  -- "5 cards bought from Alex M., (555) 123-4567; paid $120 in cash."
  v_from := concat_ws(', ', v_customer, format_phone(v_phone));

  perform internal.insert_event(p_user, v_user.name, v_user.color, b.draft_device_id, 'buy', 'buy_confirmed',
    p_target_id => p_buy_id, p_target_name => v_target, p_games => v_games,
    p_added => (internal.line_counts(array(select l from buy_lines l where l.buy_id = p_buy_id))).cards,
    p_totals => internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
    p_lines => v_lines,
    -- Bulk apart, as CONFIRM BUY's dialog counts it (0066).
    p_summary => sentence(format('%s bought from %s; paid %s in %s',
                                 internal.lines_count_text(array(select l from buy_lines l where l.buy_id = p_buy_id)), v_from,
                                 money_text(p_paid_price), p_paid_method)));

  return jsonb_build_object('number', v_number, 'games', to_jsonb(v_games), 'target_name', v_target);
end;
$function$;

CREATE OR REPLACE FUNCTION public.day_complete(p_day date, p_game text, p_user uuid, p_device uuid, p_prices jsonb DEFAULT NULL::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_cards integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  -- The day isn't over: buys confirmed later would be missed.
  if p_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;

  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
   for update;
  select array_agg(distinct b.id), coalesce(sum(l.quantity), 0) into v_ids, v_cards
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is null and l.bulk_kind is null and l.struck_at is null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  -- Today's Sell Prices for the cards completed (owner, 2026-10-09), worked
  -- out in the app as the export does (sellPrice.js): shown in green on the
  -- day page. Only for cards this completes; none given, none kept.
  if p_prices is not null and jsonb_typeof(p_prices) = 'array' then
    if exists (select 1 from jsonb_array_elements(p_prices) e
                where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0) then
      raise exception 'bad_price';
    end if;
    update buy_lines l
       set cc_sell_price = (e ->> 'sell_price')::numeric, cc_sell_basis = e -> 'sell_basis'
      from jsonb_array_elements(p_prices) e
     where l.id = (e ->> 'line_id')::uuid
       and l.buy_id = any(v_ids) and l.game = p_game and l.completed_at is null and l.bulk_kind is null and l.struck_at is null;
  end if;
  update buy_lines set completed_at = now(), completed_by = p_user
   where buy_id = any(v_ids) and game = p_game and completed_at is null and bulk_kind is null and struck_at is null;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_completed',
    p_target_name => v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), p_games => array[p_game], p_day => p_day,
    p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
    p_summary => format('%s %s buy%s (%s card%s) marked Completed, not exported.', v_count, v_game,
                        case when v_count = 1 then '' else 's' end, v_cards,
                        case when v_cards = 1 then '' else 's' end));
  return v_count;
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
    perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
      p_target_name => v_from, p_games => array[v_game], p_day => v_day,
      p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
      p_summary => format('%s Magic card%s exported (Custom SKU %s)%s.', v_cards,
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

  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
    p_target_name => v_from, p_games => array[p_game], p_day => p_day,
    p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
    p_summary => format('%s %s buy%s marked Paid/Ours again%s.', v_count, v_game,
                        case when v_count = 1 then '' else 's' end,
                        case when v_returned > 0
                             then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                                         case when v_returned = 1 then '' else 's' end)
                             else '' end));
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  p          buys;
  b          buys;
  v_lock     collection_locks;
  v_customer text := nullif(btrim(regexp_replace(coalesce(p_customer_name, ''), '\s+', ' ', 'g')), '');
  v_phone    text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  v_games    text[];
  v_count    integer;
  v_market   numeric;
  v_number   integer;
  v_day      date;
  v_target   text;
  v_lines    jsonb;
  v_user     staff_users;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- What CONFIRM BUY asks for (confirm_buy, 0020).
  if v_customer is null then
    raise exception 'name_needed';
  end if;
  if v_phone ~ '^1[0-9]{10}$' then
    v_phone := substr(v_phone, 2);
  end if;
  if v_phone is null then
    raise exception 'phone_needed';
  end if;
  if v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if p_paid_price is null or p_paid_price < 0 then
    raise exception 'paid_price_needed';
  end if;
  if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
    raise exception 'paid_method_needed';
  end if;

  select * into p from buys where id = p_buy_id and kind = 'collection' and project for update;
  if p.id is null then
    raise exception 'collection_gone';
  end if;
  if p.status <> 'paid' or exists (select 1 from buy_lines where buy_id = p.id and completed_at is not null) then
    raise exception 'project_completed';
  end if;
  -- Exported, or in Can't upload cards: the buy's day would export it again (decision 339).
  if exists (select 1 from buy_lines where buy_id = p.id and cc_status is not null) then
    raise exception 'project_exported';
  end if;
  if p_expected_version is not null and p.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  select * into v_lock from collection_locks where buy_id = p.id;
  if v_lock.buy_id is not null and v_lock.device_id is distinct from p_device
     and v_lock.heartbeat_at > now() - interval '60 seconds' then
    raise exception 'locked_elsewhere';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p.id group by game) t;
  if coalesce(v_count, 0) = 0 then
    raise exception 'empty_buy';
  end if;
  select jsonb_agg(jsonb_build_object(
           'sign', '+', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p.id;

  -- The default rates the screen showed: a project has none of its own (owner, 2026-10-15).
  -- A new buy, with the next number ever (0071).
  insert into buys (kind, status, number, customer_name, phone, notes, draft_device_id,
                    confirmed_at, confirmed_by, paid_at, paid_price, paid_method,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    created_by, last_edited_by)
  values ('walk_in', 'confirmed', internal.next_buy_number(),   -- the highest + 1 (decision 349)
          v_customer, v_phone, coalesce(btrim(p_notes), ''), p_device,
          now(), p_user, now(), p_paid_price, p_paid_method,
          p_cash_pct, p_credit_pct,
          null, null,
          p_user, p_user)
  returning * into b;

  update buy_lines set buy_id = b.id where buy_id = p.id;
  -- Each card's rates, kept (docs/TEAM_FEEDBACK.md 4.6); cards from a buy keep theirs.
  update buy_lines set custom_cash_pct = null, custom_credit_pct = null, cash_pct = null, credit_pct = null where buy_id = b.id;
  perform internal.fix_line_rates(b);

  v_day := (now() at time zone 'America/Los_Angeles')::date;
  v_number := b.number;
  v_target := format('Buy %s · %s', v_number, to_char(v_day, 'Dy Mon FMDD, YYYY'));

  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'project_converted',
    p_target_id => b.id, p_target_name => v_target, p_games => v_games,
    p_added => (internal.line_counts(array(select l from buy_lines l where l.buy_id = b.id))).cards,
    p_totals => internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
    p_lines => v_lines,
    p_fields => jsonb_build_array(jsonb_build_object('field', 'name', 'before', p.customer_name, 'after', v_customer)),
    p_summary => sentence(format('%s from the project %s, bought from %s; paid %s in %s',
                                 internal.lines_count_text(array(select l from buy_lines l where l.buy_id = b.id)), p.customer_name,
                                 concat_ws(', ', v_customer, format_phone(v_phone)),
                                 money_text(p_paid_price), p_paid_method)));

  delete from buys where id = p.id;
  return jsonb_build_object('id', b.id, 'number', v_number, 'games', to_jsonb(v_games),
                            'target_name', v_target, 'day', to_char(v_day, 'YYYY-MM-DD'));
end;
$function$;

-- The signed-in role reads the Changelog and nothing more.
revoke insert, update, delete, truncate, references, trigger, maintain on table public.events from authenticated;
drop policy "store: append" on public.events;
revoke all on sequence public.events_seq_seq from authenticated;
