-- Struck cards (owner, 2026-10-16): a third state for a card in a Paid/Ours
-- buy, collection or project. The first × strikes it: it stays on the list,
-- crossed out, as a record (moved elsewhere: put straight into the case, say),
-- but it's treated as gone for everything that moves cards on: exports, Check
-- matches, COMPLETE, Mark as completed, printouts and the header search leave
-- it out, and a buy (or a game's part of it) is Completed once its other cards
-- are. Only a second × removes it. It still counts in the totals: it was
-- bought and paid for. Right-click → Restore puts it back. Can't upload cards
-- doesn't strike: its × removes at once.
--
-- Striking some copies splits them off into a struck line just below; a
-- struck twin (the same card, condition, price and rates) takes them instead.
-- Restoring merges back into a live twin the same way. Struck lines never
-- merge with cards added or edited, and can't be edited or given a rate.
-- Logged: buy_cards_struck / buy_cards_restored, collection_cards_struck /
-- collection_cards_restored, and in buy_save_edits (Edit in project view).

alter table public.buy_lines
  add column struck_at timestamptz,
  add column struck_by uuid references public.staff_users (id);
comment on column public.buy_lines.struck_at is 'Struck (owner, 2026-10-16): moved elsewhere, kept on the list crossed out; never exported, completed or searched, still in the totals';
comment on column public.buy_lines.struck_by is 'Who struck it';

-- The same card at the same price and rates: what a strike or a restore may merge with.
create function internal.same_line(a buy_lines, b buy_lines) returns boolean
language sql immutable
set search_path = public, internal
as $$
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
$$;

-- Strike p_n copies of a line: the whole line in place, or the copies split
-- off into a struck line just below it, or into a struck twin. The struck line.
create function internal.strike_line(p_line_id uuid, p_n integer, p_user uuid) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_old  buy_lines;
  v_new  buy_lines;
  v_twin uuid;
begin
  select * into v_old from buy_lines where id = p_line_id for update;
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  p_n := least(greatest(coalesce(p_n, 1), 1), v_old.quantity);

  select l.id into v_twin from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> v_old.id and l.struck_at is not null and l.completed_at is null
     and internal.same_line(l, v_old)
   order by l.position
   limit 1;

  if v_twin is not null then
    update buy_lines set quantity = quantity + p_n where id = v_twin;
  elsif p_n >= v_old.quantity then
    update buy_lines set struck_at = now(), struck_by = p_user where id = v_old.id;
    return v_old.id;
  else
    update buy_lines set position = position + 1 where buy_id = v_old.buy_id and position > v_old.position;
    v_new := v_old;
    v_new.id := gen_random_uuid();
    v_new.position := v_old.position + 1;
    v_new.quantity := p_n;
    v_new.struck_at := now();
    v_new.struck_by := p_user;
    insert into buy_lines select (v_new).*;
    v_twin := v_new.id;
  end if;

  if p_n >= v_old.quantity then
    delete from buy_lines where id = v_old.id;
  else
    update buy_lines set quantity = quantity - p_n where id = v_old.id;
  end if;
  return v_twin;
end;
$$;

-- Restore a struck line: back in place, or into a live twin. The line it's now on.
create function internal.restore_line(p_line_id uuid) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_old  buy_lines;
  v_twin uuid;
begin
  select * into v_old from buy_lines where id = p_line_id for update;
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is null then
    raise exception 'line_not_struck';
  end if;
  select l.id into v_twin from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> v_old.id and l.struck_at is null and l.completed_at is null
     and internal.same_line(l, v_old)
   order by l.position
   limit 1;
  if v_twin is null then
    update buy_lines set struck_at = null, struck_by = null where id = v_old.id;
    return v_old.id;
  end if;
  update buy_lines set quantity = quantity + v_old.quantity where id = v_twin;
  delete from buy_lines where id = v_old.id;
  return v_twin;
end;
$$;

revoke execute on function
  internal.same_line(buy_lines, buy_lines),
  internal.strike_line(uuid, integer, uuid),
  internal.restore_line(uuid)
  from public, anon;
grant execute on function
  internal.same_line(buy_lines, buy_lines),
  internal.strike_line(uuid, integer, uuid),
  internal.restore_line(uuid)
  to authenticated, service_role;

-- × on a confirmed buy's card (the day page): strike copies.
create function public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid,
                                       p_expected_version integer, p_text text) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  b        buys;
  v_old    buy_lines;
  v_n      integer;
  v_target text;
  v_id     uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Completed (exported) cards are locked until the day is marked Paid/Ours again.
  if v_old.completed_at is not null then
    raise exception 'buy_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform buy_event(b, p_user, p_device, 'buy_cards_struck', v_target, array[v_old.game], 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(format('%s card%s struck: kept on the buy, crossed out, and never exported', v_n,
                    case when v_n = 1 then '' else 's' end)));
  return v_id;
end;
$$;

-- Right-click → Restore on a confirmed buy's struck card.
create function public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid,
                                        p_expected_version integer, p_text text) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  b        buys;
  v_old    buy_lines;
  v_target text;
  v_id     uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is null then
    raise exception 'line_not_struck';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  v_id := internal.restore_line(v_old.id);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_cards_restored', v_target, array[v_old.game], 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_old.quantity || ' ' || v_old.name))),
    sentence(format('%s struck card%s restored', v_old.quantity, case when v_old.quantity = 1 then '' else 's' end)));
  return v_id;
end;
$$;

-- × on a Paid/Ours collection's or project's card: strike copies. Not Can't
-- upload cards (its × removes at once), nor a collection that isn't Paid/Ours.
create function public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid,
                                              p_expected_version integer, p_text text) returns uuid
language plpgsql
set search_path = public, internal
as $$
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

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform collection_event(b, p_user, p_device, 'collection_cards_struck', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(format('%s card%s struck: kept on the list, crossed out, and never exported', v_n,
                          case when v_n = 1 then '' else 's' end)));
  return v_id;
end;
$$;

-- Right-click → Restore on a collection's struck card: wherever its cards
-- could still be removed (not Completed or Rejected).
create function public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid,
                                               p_expected_version integer, p_text text) returns uuid
language plpgsql
set search_path = public, internal
as $$
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

  v_id := internal.restore_line(v_old.id);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform collection_event(b, p_user, p_device, 'collection_cards_restored', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_old.quantity || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(format('%s struck card%s restored', v_old.quantity,
                          case when v_old.quantity = 1 then '' else 's' end)));
  return v_id;
end;
$$;

revoke execute on function
  public.buy_strike_line(uuid, integer, uuid, uuid, integer, text),
  public.buy_restore_line(uuid, uuid, uuid, integer, text),
  public.collection_strike_line(uuid, integer, uuid, uuid, integer, text),
  public.collection_restore_line(uuid, uuid, uuid, integer, text)
  from public, anon;
grant execute on function
  public.buy_strike_line(uuid, integer, uuid, uuid, integer, text),
  public.buy_restore_line(uuid, uuid, uuid, integer, text),
  public.collection_strike_line(uuid, integer, uuid, uuid, integer, text),
  public.collection_restore_line(uuid, uuid, uuid, integer, text)
  to authenticated, service_role;


-- Exports (a day, one buy, a collection), COMPLETE and Mark as completed: never struck cards.
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
  -- Paid/Ours only; its Magic cards exported, its Pokémon cards left as they
  -- are (owner, 2026-09-30); then it's Completed, whatever was exported.
  if v_kind = 'collection' then
    b := collection_for_write((p_target ->> 'buy_id')::uuid, p_device, (p_target ->> 'version')::integer, false);
    if b.system_key is not null then raise exception 'bad_target'; end if;
    if b.status = 'completed' then raise exception 'nothing_to_export'; end if;
    if b.status <> 'paid' then raise exception 'collection_not_paid'; end if;
    v_from := b.customer_name;
    select array_agg(l.id) into v_lines from buy_lines l where l.buy_id = b.id and l.game = 'mtg' and l.bulk_kind is null and l.struck_at is null;
    if v_lines is not null then
      perform export_check(v_lines, p_matches, p_cant, v_file);
    elsif jsonb_array_length(p_matches) > 0 or coalesce(array_length(p_cant, 1), 0) > 0 then
      raise exception 'stale_version';
    end if;

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

    update buys set status = 'completed', completed_at = now(),
                    version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = b.id returning * into b;
    perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, null, '[]',
      jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
      case when v_lines is null then 'Marked Completed: no Magic cards to export.'
           else format('Exported %s card%s (Custom SKU %s)%s; marked Completed.', v_cards,
                       case when v_cards = 1 then '' else 's' end, v_sku,
                       case when v_cant > 0 then format('; %s can''t upload, copied to Can''t upload cards', v_cant)
                            else '' end) end);
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
$function$
;
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
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_completed',
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
          format('%s %s buy%s (%s card%s) marked Completed, not exported.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end, v_cards,
                 case when v_cards = 1 then '' else 's' end));
  return v_count;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_count  integer;
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
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = b.id and game = p_game and completed_at is null and bulk_kind is null and struck_at is null;
  else
    -- COMPLETE's Sell Prices go with it (owner, 2026-10-09).
    update buy_lines set completed_at = null, completed_by = null, cc_sell_price = null, cc_sell_basis = null
     where buy_id = b.id and game = p_game and completed_at is not null and cc_status is null;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select sum(quantity), sum(unit_price * quantity) into v_cards, v_market
    from buy_lines where buy_id = b.id and game = p_game and bulk_kind is null and struck_at is null;
  perform buy_event(b, p_user, p_device,
    case when p_complete then 'buy_completed' else 'buy_uncompleted' end,
    buy_target_name(b.id), array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id and l.game = p_game)), '[]'::jsonb,
    case when p_complete
         then format('%s %s card%s marked Completed without exporting: left out of the search and the day''s export.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end)
         else format('%s %s card%s marked Paid/Ours again.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end) end);
  return v_count;
end;
$function$
;

-- A game of a buy is Completed once all its cards but bulk and struck ones are; the header search never finds them.
CREATE OR REPLACE FUNCTION public.buys_in_range(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS TABLE(id uuid, confirmed_at timestamp with time zone, confirmed_by uuid, games text[], completed_games text[], exported_games text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select b.id, b.confirmed_at, b.confirmed_by,
         array(select distinct l.game from buy_lines l where l.buy_id = b.id order by 1),
         array(select l.game from buy_lines l where l.buy_id = b.id
                group by l.game having bool_and(l.completed_at is not null or l.bulk_kind is not null or l.struck_at is not null) order by 1),
         array(select distinct l.game from buy_lines l where l.buy_id = b.id and l.cc_status is not null order by 1)
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and b.confirmed_at >= p_from and b.confirmed_at < p_to
   order by b.confirmed_at, b.id
$function$
;
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
       and l.bulk_kind is null
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

-- Cards added or edited never merge with a struck line; a struck line can't be edited or given a rate.
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
CREATE OR REPLACE FUNCTION public.collection_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  v_old  buy_lines;
  v_new  buy_lines;
  v_rows jsonb := '[]'::jsonb;
  v_side text;
  v_was  numeric;
  v_now  numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);
  -- A project has no rates (owner, 2026-10-15): it's the store's own cards.
  if b.project then
    raise exception 'project_rates';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.custom_cash_pct is not distinct from p_cash and v_old.custom_credit_pct is not distinct from p_credit then
    return;
  end if;

  update buy_lines
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit, cash_pct = null, credit_pct = null
   where id = p_line_id
  returning * into v_new;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  foreach v_side in array array['credit', 'cash'] loop
    v_was := internal.line_pct(v_old, b, v_side);
    v_now := internal.line_pct(v_new, b, v_side);
    if v_was is distinct from v_now then
      v_rows := v_rows || jsonb_build_object('field', v_side || ' %', 'before', pct_text(v_was),
        'after', pct_text(v_now) || case when (case v_side when 'cash' then p_cash else p_credit end) is null
                                         then ' (own rate cleared)' else '' end);
    end if;
  end loop;

  perform collection_event(b, p_user, p_device, 'collection_line_rate', array[v_old.game], 0, 0, null, '[]',
    v_rows,
    sentence(case when p_cash is null and p_credit is null
                  then format('Own rate cleared: %s', coalesce(p_text, v_old.name))
                  else format('Own rate set: %s', coalesce(p_text, v_old.name)) end));
end;
$function$
;

-- Edit in project view (buy_save_edits): × strikes there too, and Restore,
-- saved with the rest on SAVE BUY. p_struck: [{ id, qty, text }], copies of a
-- line (as edited) to strike; p_restored: [{ id, text }], struck lines back.
drop function public.buy_save_edits(uuid, uuid, uuid, integer, jsonb, jsonb);
CREATE OR REPLACE FUNCTION public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb, p_struck jsonb DEFAULT '[]'::jsonb, p_restored jsonb DEFAULT '[]'::jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b         buys;
  v_target  text;
  v_item    jsonb;
  v_old     buy_lines;
  r         buy_lines;
  v_touched uuid[];
  v_removed uuid[];
  v_rows    jsonb := '[]';
  v_games   text[] := '{}';
  v_edited  integer := 0;
  v_gone    integer := 0;
  v_struck  integer := 0;
  v_back    integer := 0;
  v_n       integer;
  v_market  numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  p_lines := coalesce(p_lines, '[]'::jsonb);
  p_removed := coalesce(p_removed, '[]'::jsonb);
  p_struck := coalesce(p_struck, '[]'::jsonb);
  p_restored := coalesce(p_restored, '[]'::jsonb);
  if jsonb_array_length(p_lines) + jsonb_array_length(p_removed)
     + jsonb_array_length(p_struck) + jsonb_array_length(p_restored) = 0 then
    return b.version;   -- nothing changed
  end if;

  v_removed := array(select (value ->> 'id')::uuid from jsonb_array_elements(p_removed));
  v_touched := v_removed || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_lines))
    || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_struck))
    || array(select (value ->> 'id')::uuid from jsonb_array_elements(p_restored));
  if exists (select 1 from unnest(v_touched) t(id)
              where not exists (select 1 from buy_lines l where l.id = t.id and l.buy_id = b.id)) then
    raise exception 'line_gone';
  end if;
  if exists (select 1 from buy_lines where id = any(v_touched) and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if not exists (select 1 from buy_lines where buy_id = b.id and id <> all(v_removed)) then
    raise exception 'last_card';
  end if;

  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);

  for v_item in select value from jsonb_array_elements(p_removed) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    v_rows := v_rows || jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_old.quantity || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_gone := v_gone + v_old.quantity;
    delete from buy_lines where id = v_old.id;
  end loop;

  for v_item in select value from jsonb_array_elements(p_lines) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    r := jsonb_populate_record(null::buy_lines, v_item -> 'line');
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
    where id = v_old.id;
    v_rows := v_rows
      || jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
           'text', coalesce(v_item ->> 'old_text', v_old.quantity || ' ' || v_old.name))
      || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
           'text', coalesce(v_item ->> 'new_text', r.quantity || ' ' || r.name));
    v_games := v_games || v_old.game || r.game;
    v_edited := v_edited + 1;
  end loop;

  -- Struck lines back, then copies struck (of the lines as edited).
  for v_item in select value from jsonb_array_elements(p_restored) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    if v_old.struck_at is null then
      raise exception 'line_not_struck';
    end if;
    perform internal.restore_line(v_old.id);
    v_rows := v_rows || jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_old.quantity || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_back := v_back + v_old.quantity;
  end loop;
  for v_item in select value from jsonb_array_elements(p_struck) loop
    select * into v_old from buy_lines where id = (v_item ->> 'id')::uuid;
    if v_old.id is null then
      raise exception 'line_gone';
    end if;
    v_n := least(greatest(coalesce((v_item ->> 'qty')::integer, 1), 1), v_old.quantity);
    perform internal.strike_line(v_old.id, v_n, p_user);
    v_rows := v_rows || jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(v_item ->> 'text', v_n || ' ' || v_old.name));
    v_games := v_games || v_old.game;
    v_struck := v_struck + v_n;
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_edited', v_target,
    array(select distinct g from unnest(v_games) g order by 1), v_gone,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    sentence(concat_ws('; ',
      case when v_edited > 0
           then format('%s card%s edited', v_edited, case when v_edited = 1 then '' else 's' end) end,
      case when v_gone > 0
           then format('%s card%s removed', v_gone, case when v_gone = 1 then '' else 's' end) end,
      case when v_struck > 0
           then format('%s card%s struck', v_struck, case when v_struck = 1 then '' else 's' end) end,
      case when v_back > 0
           then format('%s struck card%s restored', v_back, case when v_back = 1 then '' else 's' end) end)));
  return b.version;
end;
$function$
;
revoke execute on function public.buy_save_edits(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.buy_save_edits(uuid, uuid, uuid, integer, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
