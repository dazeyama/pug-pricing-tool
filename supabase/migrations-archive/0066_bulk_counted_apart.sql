-- Bulk counted apart in the Changelog, as CONFIRM BUY counts it (owner,
-- 2026-10-16, TEST_PASS finding 4: "Make it like confirm consistently. Bulk
-- should keep separate, placeholders are cards though").
--
-- An entry's sentence said "8 cards bought" for 7 cards and a 100-card bulk
-- item, and its +8 chip counted the item as a card. Now the sentence reads
-- "7 cards + 100 bulk bought…" ("100 bulk removed…", "1 struck card + 100
-- bulk restored…"), and an entry's added / removed count only cards: bulk is
-- in the sentence. A placeholder is a card. Card-only sentences read as
-- before, apart from a thousands comma ("1,000 cards").
--
-- A collection's cards-added / cards-removed rows also carry bulk_per, the
-- cards in one bulk item (null for a card), so a folded run in the Changelog
-- can count its bulk apart too. Entries already written stay as they were.
--
-- Same signatures: the app as pushed keeps working.

-- Cards in one bulk item (lib/bulk.js BULK_ITEMS per); null for a card or a
-- placeholder, which counts as a card.
create function internal.bulk_per(p_kind text) returns integer
language sql
immutable
set search_path = public, internal
as $$
  select case p_kind
    when 'mtg_100_common' then 100 when 'mtg_100_rare' then 100
    when 'pkm_100' then 100 when 'pkm_100_ex' then 100
    when 'mtg_10_dollar' then 10 when 'mtg_10_fifty' then 10
    when 'pkm_10_dollar' then 10 when 'pkm_10_fifty' then 10
  end
$$;

-- Lines' cards and bulk (in cards), as lib/bulk.js cardCounts counts them.
create function internal.line_counts(p_lines buy_lines[], out cards integer, out bulk integer)
language sql
immutable
set search_path = public, internal
as $$
  select coalesce(sum(l.quantity) filter (where internal.bulk_per(l.bulk_kind) is null), 0)::integer,
         coalesce(sum(l.quantity * internal.bulk_per(l.bulk_kind)), 0)::integer
    from unnest(p_lines) l
$$;

-- "7 cards + 100 bulk", "1 card", "100 bulk", as lib/bulk.js countText;
-- p_word goes before the noun: "1 struck card", "100 struck bulk".
create function internal.count_text(p_cards integer, p_bulk integer, p_word text default null) returns text
language sql
immutable
set search_path = public, internal
as $$
  select case
    when coalesce(p_bulk, 0) = 0 or coalesce(p_cards, 0) <> 0 then
      concat_ws(' ', to_char(coalesce(p_cards, 0), 'FM999,999,990'), p_word,
                case when coalesce(p_cards, 0) = 1 then 'card' else 'cards' end)
      || case when coalesce(p_bulk, 0) <> 0 then ' + ' || to_char(p_bulk, 'FM999,999,990') || ' bulk' else '' end
    else concat_ws(' ', to_char(p_bulk, 'FM999,999,990'), p_word, 'bulk')
  end
$$;

-- The same, for lines.
create function internal.lines_count_text(p_lines buy_lines[], p_word text default null) returns text
language sql
immutable
set search_path = public, internal
as $$
  select internal.count_text(c.cards, c.bulk, p_word) from internal.line_counts(p_lines) c
$$;

revoke execute on function internal.bulk_per(text) from public, anon;
grant execute on function internal.bulk_per(text) to authenticated, service_role;
revoke execute on function internal.line_counts(buy_lines[]) from public, anon;
grant execute on function internal.line_counts(buy_lines[]) to authenticated, service_role;
revoke execute on function internal.count_text(integer, integer, text) from public, anon;
grant execute on function internal.count_text(integer, integer, text) to authenticated, service_role;
revoke execute on function internal.lines_count_text(buy_lines[], text) from public, anon;
grant execute on function internal.lines_count_text(buy_lines[], text) to authenticated, service_role;

-- public.confirm_buy
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

  update buys
     set status = 'confirmed', confirmed_at = now(), confirmed_by = p_user,
         customer_name = v_customer, phone = v_phone, notes = coalesce(btrim(p_notes), ''),
         cash_pct = v_cash, credit_pct = v_credit,
         paid_price = p_paid_price, paid_method = p_paid_method, paid_at = now(),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;
  -- Each card's rate as it was priced, its own included, kept on it (docs/TEAM_FEEDBACK.md 4.6).
  perform internal.fix_line_rates(b);

  v_day := (now() at time zone 'America/Los_Angeles')::date;
  select count(*) into v_number
    from buys x
   where x.status = 'confirmed'
     and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_games[1]);
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

-- public.project_to_buy
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
  insert into buys (kind, status, customer_name, phone, notes, draft_device_id,
                    confirmed_at, confirmed_by, paid_at, paid_price, paid_method,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    created_by, last_edited_by)
  values ('walk_in', 'confirmed', v_customer, v_phone, coalesce(btrim(p_notes), ''), p_device,
          now(), p_user, now(), p_paid_price, p_paid_method,
          p_cash_pct, p_credit_pct,
          null, null,
          p_user, p_user)
  returning * into b;

  update buy_lines set buy_id = b.id where buy_id = p.id;
  -- Each card's rates, kept (docs/TEAM_FEEDBACK.md 4.6); cards from a buy keep theirs.
  update buy_lines set custom_cash_pct = null, custom_credit_pct = null, cash_pct = null, credit_pct = null where buy_id = b.id;
  perform internal.fix_line_rates(b);

  -- Its number on today's page, counted as confirm_buy counts it.
  v_day := (now() at time zone 'America/Los_Angeles')::date;
  select count(*) into v_number
    from buys x
   where x.kind = 'walk_in' and x.status = 'confirmed'
     and (x.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = v_games[1]);
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

-- public.buy_delete
CREATE OR REPLACE FUNCTION public.buy_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = b.id group by game) t;
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_deleted', v_target, coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = b.id))).cards, internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), coalesce(v_lines, '[]'::jsonb),
    sentence('Buy deleted with ' || internal.lines_count_text(array(select l from buy_lines l where l.buy_id = b.id))));

  delete from buys where id = b.id;
end;
$function$;

-- public.collection_delete
CREATE OR REPLACE FUNCTION public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
    0, (internal.line_counts(array(select l from buy_lines l where l.buy_id = b.id))).cards, internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), coalesce(v_lines, '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', null),
      jsonb_build_object('field', 'phone', 'before', format_phone(b.phone), 'after', null)),
    sentence('Collection deleted with ' || internal.lines_count_text(array(select l from buy_lines l where l.buy_id = b.id))));

  delete from buys where id = p_buy_id;
end;
$function$;

-- public.buy_to_project
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
  if exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) filter (where struck_at is null) as q,
                 sum(unit_price * quantity) filter (where struck_at is null) as m
            from buy_lines where buy_id = b.id group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null;
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null;

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null, b.paid_price, b.paid_method, coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null;
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
                                                                  where l.buy_id = b.id and l.struck_at is not null),
                                                            'struck') || ' left out'
                     else '' end));

  delete from buys where id = b.id;
  return p.id;
end;
$function$;

-- public.collection_add_line
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
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
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
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], (internal.line_counts(array[r])).cards, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'bulk_per', internal.bulk_per(r.bulk_kind), 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[r]) || ' added'));
  return v_line;
end;
$function$;

-- public.collection_remove_line
CREATE OR REPLACE FUNCTION public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  -- Paid/Ours may still lose cards (owner, 2026-09-29); Completed may not.
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (and on the row, for a folded run)
  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, (internal.line_counts(array[v_old])).cards,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'bulk_per', internal.bulk_per(v_old.bulk_kind), 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' removed'));
end;
$function$;

-- public.buy_remove_line
CREATE OR REPLACE FUNCTION public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_old    buy_lines;
  v_n      integer;
  v_target text;
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
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity
     and not exists (select 1 from buy_lines where buy_id = b.id and id <> p_line_id) then
    raise exception 'last_card';
  end if;

  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);

  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (lines_totals)
  perform buy_event(b, p_user, p_device, 'buy_cards_removed', v_target, array[v_old.game], (internal.line_counts(array[v_old])).cards,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(internal.lines_count_text(array[v_old]) || ' removed from a confirmed buy'));
end;
$function$;

-- public.buy_strike_line
CREATE OR REPLACE FUNCTION public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
    sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the buy, crossed out, and never exported'));
  return v_id;
end;
$function$;

-- public.collection_strike_line
CREATE OR REPLACE FUNCTION public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  if b.project then
    raise exception 'project_no_strike';
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
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the list, crossed out, and never exported'));
  return v_id;
end;
$function$;

-- public.buy_restore_line
CREATE OR REPLACE FUNCTION public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
    sentence(internal.lines_count_text(array[v_old], 'struck') || ' restored'));
  return v_id;
end;
$function$;

-- public.collection_restore_line
CREATE OR REPLACE FUNCTION public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
    '[]', sentence(internal.lines_count_text(array[v_old], 'struck') || ' restored'));
  return v_id;
end;
$function$;

-- public.buy_save_edits
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
  v_edited_bulk integer := 0;   -- bulk counted apart, in cards (0066)
  v_gone_bulk   integer := 0;
  v_struck_bulk integer := 0;
  v_back_bulk   integer := 0;
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
    v_gone := v_gone + (internal.line_counts(array[v_old])).cards;
    v_gone_bulk := v_gone_bulk + (internal.line_counts(array[v_old])).bulk;
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
    -- A card line counts once; a bulk line as the bulk it now holds.
    if internal.bulk_per(r.bulk_kind) is null then
      v_edited := v_edited + 1;
    else
      v_edited_bulk := v_edited_bulk + (internal.line_counts(array[r])).bulk;
    end if;
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
    v_back := v_back + (internal.line_counts(array[v_old])).cards;
    v_back_bulk := v_back_bulk + (internal.line_counts(array[v_old])).bulk;
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
    v_struck := v_struck + case when internal.bulk_per(v_old.bulk_kind) is null then v_n else 0 end;
    v_struck_bulk := v_struck_bulk + coalesce(v_n * internal.bulk_per(v_old.bulk_kind), 0);
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_edited', v_target,
    array(select distinct g from unnest(v_games) g order by 1), v_gone,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    sentence(concat_ws('; ',
      case when v_edited + v_edited_bulk > 0
           then internal.count_text(v_edited, v_edited_bulk) || ' edited' end,
      case when v_gone + v_gone_bulk > 0
           then internal.count_text(v_gone, v_gone_bulk) || ' removed' end,
      case when v_struck + v_struck_bulk > 0
           then internal.count_text(v_struck, v_struck_bulk) || ' struck' end,
      case when v_back + v_back_bulk > 0
           then internal.count_text(v_back, v_back_bulk, 'struck') || ' restored' end)));
  return b.version;
end;
$function$;
