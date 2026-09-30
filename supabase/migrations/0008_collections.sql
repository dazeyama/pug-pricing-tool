-- Phase 7: collections (spec 6.2, 9). Every write goes through one function
-- that makes the change and writes its changelog entry in the same
-- transaction. Writes need this computer to hold the collection's lock
-- (spec 9.6) and, where the UI read a version, that version.
--
-- Error codes the app turns into messages: collection_gone, not_lock_holder,
-- stale_version, collection_paid, locked_elsewhere, name_mismatch, bad_name,
-- bad_phone, bad_pct, bad_status, no_user, line_gone.

-- ---------------------------------------------------------------------------
-- Small helpers.
-- ---------------------------------------------------------------------------

-- A Master Buy Percentage from settings ('cash_pct' / 'credit_pct').
create or replace function public.master_pct(p_key text) returns numeric
language sql stable
set search_path = public
as $$
  select (value #>> '{}')::numeric from settings where key = p_key
$$;

-- "5551234567" → "(555) 123-4567", for changelog field rows.
create or replace function public.format_phone(p text) returns text
language sql immutable
as $$
  select case when p ~ '^[0-9]{10}$'
              then format('(%s) %s-%s', substr(p, 1, 3), substr(p, 4, 3), substr(p, 7, 4))
              else p end
$$;

-- A status as the app shows it.
create or replace function public.status_label(p text) returns text
language sql immutable
as $$
  select case p when 'processing' then 'Processing' when 'priced' then 'Priced'
                when 'paid' then 'Paid/Ours' else p end
$$;

-- One sentence, one full stop, even when it ends in a name like "Alex M.".
create or replace function public.sentence(p text) returns text
language sql immutable
as $$
  select regexp_replace(p, '\.?$', '.')
$$;

-- A percentage for a field row: 40.00 → "40", 33.5 → "33.5".
create or replace function public.pct_text(p numeric) returns text
language sql immutable
as $$
  select trim_scale(p)::text
$$;

-- An entry's totals for p_market worth of cards, at the collection's rates:
-- the Paid/Ours snapshot, else its custom rates, else the master ones.
create or replace function public.collection_totals(b buys, p_market numeric) returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
           'market', p_market,
           'cash', round_down_price(p_market * t.c / 100)::numeric(12,2),
           'credit', round_down_price(p_market * t.cr / 100)::numeric(12,2),
           'cash_pct', t.c, 'credit_pct', t.cr)
  from (select coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct')) as c,
               coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')) as cr) t
$$;

-- A collection's changelog entry. The user's name and colour are frozen, and
-- the target name is the customer's name (spec 6.1 events).
create or replace function public.collection_event(
  b          buys,
  p_user     uuid,
  p_device   uuid,
  p_action   text,
  p_games    text[],
  p_added    integer,
  p_removed  integer,
  p_totals   jsonb,
  p_lines    jsonb,
  p_fields   jsonb,
  p_summary  text
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, removed, totals, lines, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'collection', p_action,
          b.id, b.customer_name, coalesce(p_games, '{}'), coalesce(p_added, 0), coalesce(p_removed, 0),
          p_totals, coalesce(p_lines, '[]'::jsonb), coalesce(p_fields, '[]'::jsonb), coalesce(p_summary, ''));
end;
$$;

-- The collection a write is for, locked for the transaction: it exists, this
-- computer holds its editing lock (spec 9.6; a lock gone quiet is still this
-- computer's until another takes it), the version matches, and it isn't
-- Paid/Ours when the write changes contents or details. Refreshes the lock.
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
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_create: + Price Collection (spec 9.2). Status Processing.
-- ---------------------------------------------------------------------------
create or replace function public.collection_create(
  p_name   text,
  p_phone  text,
  p_notes  text,
  p_user   uuid,
  p_device uuid
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  b       buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;

  insert into buys (kind, status, customer_name, phone, notes, created_by, last_edited_by)
  values ('collection', 'processing', v_name, p_phone, v_notes, p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', null, 'after', v_name),
      jsonb_build_object('field', 'phone', 'before', null, 'after', format_phone(p_phone)))
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Collection created for %s', v_name)));
  return b.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_add_line: ADD CARD on a collection. Identical lines merge
-- (spec 6.1). p_text is the line's buy-list text for the entry's card row.
-- ---------------------------------------------------------------------------
create or replace function public.collection_add_line(
  p_buy_id           uuid,
  p_line             jsonb,
  p_merge            boolean,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_text             text
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  b      buys;
  r      buy_lines;
  v_line uuid;
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
     limit 1;
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      p_buy_id,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = p_buy_id),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = p_buy_id;

  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], r.quantity, 0,
    collection_totals(b, r.unit_price * r.quantity),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name))),
    '[]', sentence(format('%s card%s added', r.quantity, case when r.quantity = 1 then '' else 's' end)));
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_update_line: EDIT CARD on a collection (owner, 2026-09-29: an
-- edit always takes today's price). Merges with an identical line, keeping
-- the earlier place, like draft_update_line. Logged as one entry: the old
-- line out (−), the new one in (+).
-- ---------------------------------------------------------------------------
create or replace function public.collection_update_line(
  p_line_id          uuid,
  p_line             jsonb,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_old_text         text,
  p_new_text         text
) returns uuid
language plpgsql
set search_path = public
as $$
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
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url
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
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_old.position then
      update buy_lines set quantity = quantity + r.quantity where id = v_other;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines set quantity = quantity + (select quantity from buy_lines where id = v_other)
       where id = p_line_id;
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
$$;

-- ---------------------------------------------------------------------------
-- collection_remove_line: take p_qty copies off a line; the line goes when
-- none are left. p_text is the removed copies' line text ("2 Sol Ring …").
-- ---------------------------------------------------------------------------
create or replace function public.collection_remove_line(
  p_line_id          uuid,
  p_qty              integer,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_text             text
) returns void
language plpgsql
set search_path = public
as $$
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
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, v_n,
    collection_totals(b, v_old.unit_price * v_n),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    '[]', sentence(format('%s card%s removed', v_n, case when v_n = 1 then '' else 's' end)));
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_update_info: name, phone, notes and custom rates (spec 9.4,
-- 8.9.1). p_fields holds only the fields being set; custom_cash_pct /
-- custom_credit_pct null = back to the master rate. Unchanged fields are
-- ignored; nothing changed = nothing written.
-- ---------------------------------------------------------------------------
create or replace function public.collection_update_info(
  p_buy_id           uuid,
  p_fields           jsonb,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_name   text;
  v_phone  text;
  v_notes  text;
  v_cash   numeric;
  v_credit numeric;
  v_rows   jsonb := '[]'::jsonb;
  v_names  text[] := '{}';
  v_master numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_cash := b.custom_cash_pct;
  v_credit := b.custom_credit_pct;

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

  if jsonb_array_length(v_rows) = 0 then
    return;
  end if;

  update buys
     set customer_name = v_name, phone = v_phone, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_set_status (spec 9.5): moving to Paid/Ours snapshots the rates
-- (custom where set, else the master rate the screen showed) and paid_at;
-- leaving it clears the snapshot but keeps the custom rates.
-- ---------------------------------------------------------------------------
create or replace function public.collection_set_status(
  p_buy_id           uuid,
  p_status           text,
  p_user             uuid,
  p_device           uuid,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer
) returns void
language plpgsql
set search_path = public
as $$
declare
  b     buys;
  v_was text;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if p_status not in ('processing', 'priced', 'paid') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;

  if p_status = 'paid' then
    update buys
       set status = 'paid', paid_at = now(),
           cash_pct = coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct')),
           credit_pct = coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct')),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
  else
    update buys
       set status = p_status, paid_at = null, cash_pct = null, credit_pct = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
  end if;

  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'status',
      'before', status_label(v_was), 'after', status_label(p_status))),
    case when v_was = 'paid' then sentence('Unlocked: back to ' || status_label(p_status))
         when p_status = 'paid' then 'Marked Paid/Ours: locked.'
         else sentence('Marked ' || status_label(p_status)) end);
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_delete (spec 9.7): the typed name must match; a collection
-- another computer is editing can't be deleted. The entry keeps every line
-- (p_line_texts: line id → buy-list text), the totals, name and phone.
-- ---------------------------------------------------------------------------
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
-- Editing locks (spec 9.6). A lock is stale after 60s without a heartbeat.
-- lock_acquire takes a free or stale lock, keeps this computer's own, or
-- with p_force takes another's; it returns who holds the lock now.
-- ---------------------------------------------------------------------------
create or replace function public.lock_acquire(
  p_buy_id uuid,
  p_device uuid,
  p_user   uuid,
  p_force  boolean default false
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v jsonb;
begin
  if not exists (select 1 from buys where id = p_buy_id and kind = 'collection') then
    raise exception 'collection_gone';
  end if;

  insert into collection_locks as l (buy_id, device_id, staff_user_id, acquired_at, heartbeat_at)
  values (p_buy_id, p_device, p_user, now(), now())
  on conflict (buy_id) do update
     set device_id = excluded.device_id,
         staff_user_id = excluded.staff_user_id,
         acquired_at = case when l.device_id = excluded.device_id then l.acquired_at else now() end,
         heartbeat_at = now()
   where p_force
      or l.device_id = excluded.device_id
      or l.heartbeat_at < now() - interval '60 seconds';

  select jsonb_build_object(
           'held', l.device_id = p_device,
           'device_id', l.device_id,
           'device_label', d.label,
           'staff_user_id', l.staff_user_id,
           'acquired_at', l.acquired_at)
    into v
    from collection_locks l left join devices d on d.id = l.device_id
   where l.buy_id = p_buy_id;
  return v;
end;
$$;

-- Every 20s from the lock holder. False = this computer no longer holds it.
create or replace function public.lock_heartbeat(
  p_buy_id uuid,
  p_device uuid,
  p_user   uuid default null
) returns boolean
language plpgsql
set search_path = public
as $$
begin
  update collection_locks
     set heartbeat_at = now(), staff_user_id = coalesce(p_user, staff_user_id)
   where buy_id = p_buy_id and device_id = p_device;
  return found;
end;
$$;

-- Leaving the screen: let go, if this computer still holds it.
create or replace function public.lock_release(p_buy_id uuid, p_device uuid) returns void
language sql
set search_path = public
as $$
  delete from collection_locks where buy_id = p_buy_id and device_id = p_device;
$$;

-- ---------------------------------------------------------------------------
-- Only the signed-in store runs these.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.master_pct(text),
  public.format_phone(text),
  public.status_label(text),
  public.sentence(text),
  public.pct_text(numeric),
  public.collection_totals(buys, numeric),
  public.collection_event(buys, uuid, uuid, text, text[], integer, integer, jsonb, jsonb, jsonb, text),
  public.collection_for_write(uuid, uuid, integer, boolean),
  public.collection_create(text, text, text, uuid, uuid),
  public.collection_add_line(uuid, jsonb, boolean, uuid, uuid, integer, text),
  public.collection_update_line(uuid, jsonb, uuid, uuid, integer, text, text),
  public.collection_remove_line(uuid, integer, uuid, uuid, integer, text),
  public.collection_update_info(uuid, jsonb, uuid, uuid, integer),
  public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer),
  public.collection_delete(uuid, uuid, uuid, text, jsonb),
  public.lock_acquire(uuid, uuid, uuid, boolean),
  public.lock_heartbeat(uuid, uuid, uuid),
  public.lock_release(uuid, uuid)
from public, anon;

grant execute on function
  public.master_pct(text),
  public.format_phone(text),
  public.status_label(text),
  public.sentence(text),
  public.pct_text(numeric),
  public.collection_totals(buys, numeric),
  public.collection_event(buys, uuid, uuid, text, text[], integer, integer, jsonb, jsonb, jsonb, text),
  public.collection_for_write(uuid, uuid, integer, boolean),
  public.collection_create(text, text, text, uuid, uuid),
  public.collection_add_line(uuid, jsonb, boolean, uuid, uuid, integer, text),
  public.collection_update_line(uuid, jsonb, uuid, uuid, integer, text, text),
  public.collection_remove_line(uuid, integer, uuid, uuid, integer, text),
  public.collection_update_info(uuid, jsonb, uuid, uuid, integer),
  public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer),
  public.collection_delete(uuid, uuid, uuid, text, jsonb),
  public.lock_acquire(uuid, uuid, uuid, boolean),
  public.lock_heartbeat(uuid, uuid, uuid),
  public.lock_release(uuid, uuid)
to authenticated;
