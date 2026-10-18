-- Buys numbered once, forever (owner, 2026-10-17, from the team: "the first
-- buy ever for either game is Buy 1, then Buy 2, and another the next day
-- starts at Buy 3, even if that was a Magic buy the following Pokémon buy
-- becomes Buy 4 … This will help tracking and physical storage"). Until now
-- a buy's number was its place among the day's confirmed buys of its game,
-- counted afresh wherever it was shown (confirm_buy, buy_target_name,
-- export_lines' Can't-upload notes, global_search): "Buy 1" every morning,
-- for Magic and for Pokémon alike.
--
-- Now `buys.number` is set from one sequence when a walk-in buy is confirmed
-- (confirm_buy) or made from a project (project_to_buy); every confirmed
-- buy so far gets its number in confirmed order. `internal.buy_number(buy)`
-- reads it, falling back to the old day count for a row without one (a
-- restored backup from before this migration); everything that names a buy
-- goes through it.
--
-- Also the export's Custom SKU (owner, 2026-10-17): a day page's export is
-- stamped with the day being exported ("101626" for October 16, 2026), not
-- the date it's run; "Export single buy" with that day and the buy's number
-- ("101626-42"). Collections, projects and Can't upload cards keep today's
-- date. `internal.cc_custom_sku(date)` is the new form.

alter table public.buys add column if not exists number integer;
create unique index if not exists buys_number_key on public.buys (number);
create sequence if not exists public.buys_number_seq as integer;
grant usage, select on sequence public.buys_number_seq to authenticated, service_role;

-- Every confirmed walk-in buy so far, in the order they were confirmed.
with ordered as (
  select id, row_number() over (order by confirmed_at, id) as n
    from public.buys
   where kind = 'walk_in' and status = 'confirmed' and number is null
)
update public.buys b set number = o.n + coalesce((select max(number) from public.buys), 0)
  from ordered o where o.id = b.id;
select setval('public.buys_number_seq', greatest(coalesce((select max(number) from public.buys), 0), 1),
              (select max(number) from public.buys) is not null);

-- A buy's number: its own, or for a row without one (a backup from before
-- numbers), its old place among the day's confirmed buys of its game.
create or replace function internal.buy_number(p_buy public.buys)
 returns integer
 language sql
 stable
 set search_path to 'public', 'internal'
as $function$
  with b as (
    select p_buy.id, p_buy.confirmed_at, (p_buy.confirmed_at at time zone 'America/Los_Angeles')::date as day,
           case when exists (select 1 from buy_lines l where l.buy_id = p_buy.id and l.game = 'mtg')
                then 'mtg' else 'pokemon' end as game
  )
  select coalesce(p_buy.number, (select count(*) from buys x
             where x.kind = 'walk_in' and x.status = 'confirmed'
               and (x.confirmed_at at time zone 'America/Los_Angeles')::date = b.day
               and (x.confirmed_at, x.id) <= (b.confirmed_at, b.id)
               and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = b.game)))
    from b
$function$;
grant execute on function internal.buy_number(public.buys) to authenticated, service_role;

-- The Custom SKU for a day: month with no leading zero, day two digits, two-digit year.
create or replace function internal.cc_custom_sku(p_day date)
 returns text
 language sql
 immutable
as $function$
  select to_char(p_day, 'FMMMDDYY');
$function$;
grant execute on function internal.cc_custom_sku(date) to authenticated, service_role;

CREATE OR REPLACE FUNCTION internal.buy_target_name(p_buy_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with b as (
    select id, confirmed_at, (confirmed_at at time zone 'America/Los_Angeles')::date as day,
           case when exists (select 1 from buy_lines l where l.buy_id = buys.id and l.game = 'mtg')
                then 'mtg' else 'pokemon' end as game
      from buys where id = p_buy_id
  )
  select format('Buy %s · %s', buy_number(x), to_char(b.day, 'Dy Mon FMDD, YYYY'))
    from b join buys x on x.id = b.id
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
         number = coalesce(number, nextval('buys_number_seq')),
         customer_name = v_customer, phone = v_phone, notes = coalesce(btrim(p_notes), ''),
         cash_pct = v_cash, credit_pct = v_credit,
         paid_price = p_paid_price, paid_method = p_paid_method, paid_at = now(),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;
  -- Each card's rate as it was priced, its own included, kept on it (docs/TEAM_FEEDBACK.md 4.6).
  perform internal.fix_line_rates(b);

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

  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, b.draft_device_id, 'buy', 'buy_confirmed',
          p_buy_id, v_target, v_games, (internal.line_counts(array(select l from buy_lines l where l.buy_id = p_buy_id))).cards,
          internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
          coalesce(v_lines, '[]'::jsonb),
          -- Bulk apart, as CONFIRM BUY's dialog counts it (0066).
          sentence(format('%s bought from %s; paid %s in %s',
                          internal.lines_count_text(array(select l from buy_lines l where l.buy_id = p_buy_id)), v_from,
                          money_text(p_paid_price), p_paid_method)));

  return jsonb_build_object('number', v_number, 'games', to_jsonb(v_games), 'target_name', v_target);
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
  values ('walk_in', 'confirmed', nextval('buys_number_seq'), v_customer, v_phone, coalesce(btrim(p_notes), ''), p_device,
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
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, totals, lines, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'project_converted',
          b.id, v_target, v_games, (internal.line_counts(array(select l from buy_lines l where l.buy_id = b.id))).cards,
          internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)),
          coalesce(v_lines, '[]'::jsonb),
          jsonb_build_array(jsonb_build_object('field', 'name', 'before', p.customer_name, 'after', v_customer)),
          sentence(format('%s from the project %s, bought from %s; paid %s in %s',
                          internal.lines_count_text(array(select l from buy_lines l where l.buy_id = b.id)), p.customer_name,
                          concat_ws(', ', v_customer, format_phone(v_phone)),
                          money_text(p_paid_price), p_paid_method)));

  delete from buys where id = p.id;
  return jsonb_build_object('id', b.id, 'number', v_number, 'games', to_jsonb(v_games),
                            'target_name', v_target, 'day', to_char(v_day, 'YYYY-MM-DD'));
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
    v_sku := cc_custom_sku(v_day);

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
    v_sku := cc_custom_sku((b.confirmed_at at time zone 'America/Los_Angeles')::date) || '-' || buy_number(b);
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
$function$;

CREATE OR REPLACE FUNCTION public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean DEFAULT false, p_struck boolean DEFAULT false)
 RETURNS TABLE(line_id uuid, buy_id uuid, kind text, status text, customer_name text, paid_method text, confirmed_at timestamp with time zone, confirmed_by uuid, created_at timestamp with time zone, buy_number integer, game text, lang text, name text, name_en text, set_code text, collector_number text, finish text, first_edition boolean, treatments jsonb, condition text, quantity integer, image_url text, completed boolean, collection_kind text, bulk_kind text, struck_at timestamp with time zone, struck_by uuid)
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
           -- A struck card is never completed itself: in a walk-in buy it reads as its game
           -- does, Completed once no live card of that game is left to export (0067).
           case when l.struck_at is null or b.kind <> 'walk_in' then l.completed_at is not null
                else not exists (select 1 from buy_lines y
                                  where y.buy_id = l.buy_id and y.game = l.game and y.completed_at is null
                                    and y.bulk_kind is null and y.struck_at is null)
           end as completed,
           case when b.kind = 'collection' then
             case when b.system_key is not null then 'system' when b.project then 'project' else 'collection' end
           end as collection_kind,
           l.bulk_kind, l.struck_at, l.struck_by,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed' and (p_all or l.completed_at is null))
         or (b.kind = 'collection'
             and (b.status = 'paid' or (p_all and b.status in ('processing', 'priced', 'completed', 'rejected')))))
       and (l.bulk_kind is null or l.bulk_kind like '%placeholder')   -- placeholders by their name
       and (l.struck_at is null or p_struck)   -- struck: moved elsewhere; Show all finds it, marked (0067)
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
     order by newest desc, l.buy_id, l.position
     limit 200
  )
  select h.line_id, h.buy_id, h.kind, h.status, h.customer_name, h.paid_method,
         h.confirmed_at, h.confirmed_by, h.created_at,
         case when h.kind = 'walk_in' then (select buy_number(x) from buys x where x.id = h.buy_id) end,
         h.game, h.lang, h.name, h.name_en, h.set_code, h.collector_number, h.finish,
         h.first_edition, h.treatments, h.condition, h.quantity, h.image_url, h.completed,
         h.collection_kind, h.bulk_kind, h.struck_at, h.struck_by
    from hits h
   order by h.newest desc, h.buy_id, h.position
$function$;
