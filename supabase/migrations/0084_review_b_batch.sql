-- 0084: the full launch review's B findings that need the database (DESIGN_SPEC decisions
-- 350–354), one migration for one batch of work (CLAUDE.md, Database).
--
--  350 (B1, B2) A walk-in scan remembers the buy it was sent to (target_draft_id). When
--      that buy is confirmed or cancelled, its scans not added by then fail with a note
--      the phone shows ("… scan it again for the next buy"; the owner, 2026-10-19), and
--      draft_add_line, given the buy a scan was for, refuses (draft_gone) once it's gone
--      instead of starting the next customer's buy with it. scan_claim takes the draft.
--  351 (B3) A copy merged into a line records its scan's id on the line
--      (price_snapshot.scans), so a scan claimed again sees it already went in.
--  352 (B8) internal.same_card: two cards with neither a Scryfall nor a TCGdex id (a
--      TCGplayer-only Pokémon card) are one card only with the same set, number and products.
--  353 (B11) A walk-in buy's Completed side is locked: strike, × and Restore refuse its
--      bulk, placeholders and struck cards too (buy_completed).
--  354 (B15) settings_save: a Settings save says which version of the setting it changed;
--      one from an out-of-date screen is refused (settings_changed; the owner, 2026-10-19).
--
-- scan_claim and draft_add_line take a new argument with a default: a call without it
-- (the app before this change) works as before; they're dropped and re-created (another
-- signature would be a second function), with their grants.

alter table public.scans add column target_draft_id uuid;   -- a walk-in's draft; no key: it goes on confirm
comment on column public.scans.target_draft_id is 'The walk-in buy (draft) it was sent to (decision 350).';

-- A finished walk-in buy's scans not added by then (decision 350).
create or replace function internal.scans_finished(p_device uuid, p_buy uuid, p_note text)
 returns void
 language sql
 set search_path to 'public', 'internal'
as $function$
  update scans set status = 'failed', note = p_note, handled_at = now()
   where p_device is not null and session_device_id = p_device and target_kind = 'walk_in'
     and (target_draft_id = p_buy or target_draft_id is null)
     and status in ('sent', 'pricing', 'needs_price');
$function$;
revoke all on function internal.scans_finished(uuid, uuid, text) from public, anon;
grant execute on function internal.scans_finished(uuid, uuid, text) to authenticated, service_role;

-- A Settings save, refused from an out-of-date screen (decision 354).
create or replace function public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamptz)
 returns timestamptz
 language plpgsql
 set search_path to 'public', 'internal'
as $function$
declare
  v settings;
  v_at timestamptz := clock_timestamp();   -- not the transaction's start: two saves in one never look alike
begin
  select * into v from settings where key = p_key for update;
  if (v.key is null and p_expected is not null) or (v.key is not null and v.updated_at is distinct from p_expected) then
    raise exception 'settings_changed';
  end if;
  insert into settings (key, value, updated_at, updated_by) values (p_key, p_value, v_at, p_user)
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end;
$function$;
revoke all on function public.settings_save(text, jsonb, uuid, timestamptz) from public, anon;
grant execute on function public.settings_save(text, jsonb, uuid, timestamptz) to authenticated, service_role;

drop function public.scan_claim(uuid, uuid, text, uuid);
drop function public.draft_add_line(uuid, jsonb, uuid, boolean);

CREATE OR REPLACE FUNCTION internal.same_card(l buy_lines, r buy_lines)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select l.game = r.game and l.lang = r.lang
     and coalesce(l.scryfall_id, '') = coalesce(r.scryfall_id, '')
     and coalesce(l.tcgdex_id, '') = coalesce(r.tcgdex_id, '')
     and l.finish = r.finish and l.first_edition = coalesce(r.first_edition, false)
     and l.treatments = coalesce(r.treatments, '[]'::jsonb)
     and l.condition = r.condition
     and l.unit_price = r.unit_price and l.price_source = r.price_source
     and l.bulk_kind is not distinct from r.bulk_kind   -- bulk merges with the same item only
     and l.name = r.name                                -- a placeholder: the same name typed (owner, 2026-10-16)
     -- With neither id (a TCGplayer-only Pokémon card), the same set, number and products (decision 352).
     and (l.scryfall_id is not null or l.tcgdex_id is not null
          or (coalesce(l.set_code, '') = coalesce(r.set_code, '')
              and coalesce(l.collector_number, '') = coalesce(r.collector_number, '')
              and coalesce(l.tcgplayer_id, '') = coalesce(r.tcgplayer_id, '')
              and coalesce(l.justtcg_card_id, '') = coalesce(r.justtcg_card_id, '')))
$function$;

CREATE OR REPLACE FUNCTION public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scan_sessions;
  v_id uuid;
  v_client uuid := case when p_scan ->> 'client_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (p_scan ->> 'client_id')::uuid end;
begin
  -- Sent before (a retry after no answer in time): the scan already saved, never a second copy.
  if v_client is not null then
    select id into v_id from scans where phone_device_id = p_phone and client_id = v_client;
    if v_id is not null then
      return v_id;
    end if;
  end if;
  select * into v from scan_sessions where device_id = p_device;
  if not found then
    raise exception 'session_gone';
  end if;
  if v.phone_device_id is distinct from p_phone then
    raise exception 'not_paired';
  end if;
  if v.heartbeat_at < now() - interval '60 seconds' then
    raise exception 'session_stale';
  end if;
  if not v.can_add then
    raise exception 'cannot_add';
  end if;
  if coalesce(btrim(p_scan ->> 'scryfall_id'), '') = ''
     or coalesce(p_scan ->> 'finish', '') not in ('nonfoil', 'foil', 'etched')
     or coalesce(p_scan ->> 'condition', '') not in ('NM', 'LP', 'MP', 'HP', 'DMG')
     or coalesce(p_scan ->> 'tier', '1') !~ '^[123]$' then
    raise exception 'bad_scan';
  end if;

  delete from scans where created_at < now() - interval '7 days';
  -- The list it's for (decision 343): only that list claims it.
  insert into scans (session_device_id, phone_device_id, scryfall_id, name, set_code, collector_number,
                     finish, condition, tier, client_id, target_kind, target_buy_id, target_draft_id)
  values (p_device, p_phone, btrim(p_scan ->> 'scryfall_id'), coalesce(p_scan ->> 'name', ''),
          coalesce(p_scan ->> 'set_code', ''), coalesce(p_scan ->> 'collector_number', ''),
          p_scan ->> 'finish', p_scan ->> 'condition', coalesce(p_scan ->> 'tier', '1')::smallint, v_client,
          v.target_kind, v.buy_id,
          -- A walk-in's buy, as it is now (decision 350).
          -- Opened now if there isn't one yet, so every walk-in scan knows its buy.
          case when v.target_kind = 'walk_in' then draft_for_device(p_device, v.staff_user_id) end)
  on conflict (phone_device_id, client_id) where client_id is not null do nothing
  returning id into v_id;
  -- The same scan arriving twice at once (the retry while the first was still on its way).
  if v_id is null then
    select id into v_id from scans where phone_device_id = p_phone and client_id = v_client;
    return v_id;
  end if;
  update scan_sessions set phone_seen_at = now() where device_id = p_device;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_claim(p_id uuid, p_device uuid, p_kind text DEFAULT NULL::text, p_buy_id uuid DEFAULT NULL::uuid, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v jsonb;
begin
  update scans c
     set status = case when status in ('undo', 'undoing') then 'undoing' else 'pricing' end, handled_at = now()
   where c.id = p_id and c.session_device_id = p_device
     and (c.target_kind is null
          or (p_kind is not null and c.target_kind = p_kind and c.target_buy_id is not distinct from p_buy_id)
          or (p_kind is null and exists (select 1 from scan_sessions s
                                          where s.device_id = p_device and s.target_kind = c.target_kind
                                            and s.buy_id is not distinct from c.target_buy_id)))
     -- A walk-in scan, by the buy it was sent to, when the app names its own (decision 350); an
     -- app that names none (the one before this) as before, and an Undo whatever the buy.
     and (c.target_kind is distinct from 'walk_in' or c.target_draft_id is null or p_draft_id is null
          or c.target_draft_id = p_draft_id or c.status in ('undo', 'undoing'))
     and (c.status in ('sent', 'undo')
          or (c.status in ('pricing', 'undoing') and c.handled_at < now() - interval '1 minute'))
  returning to_jsonb(c.*) into v;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean DEFAULT true, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy  uuid;
  v_line uuid;
  r      buy_lines;
begin
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
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
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind)
    values (
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return v_line;
end;
$function$;

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
       and l.cc_status is null   -- nor an exported one (decision 345)
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

CREATE OR REPLACE FUNCTION public.draft_cancel(p_buy_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  -- Its scans not added are left out, and the phone says so (decision 350).
  select internal.scans_finished((select draft_device_id from buys where id = p_buy_id and status = 'draft'), p_buy_id,
                                 'The buy was cancelled: scan it again for the next buy');
  delete from buys where id = p_buy_id and status = 'draft';
$function$;

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
  -- A Completed side is locked, its bulk, placeholders and struck cards too (decision 353).
  if exists (select 1 from buy_lines where buy_id = v_old.buy_id and game = v_old.game and completed_at is not null) then
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
  -- A Completed side is locked, its bulk, placeholders and struck cards too (decision 353).
  if exists (select 1 from buy_lines where buy_id = v_old.buy_id and game = v_old.game and completed_at is not null) then
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
  -- A Completed side is locked, all of it (decision 353).
  if exists (select 1 from buy_lines l join buy_lines t on t.buy_id = l.buy_id and t.game = l.game
              where l.id = any(v_touched) and t.completed_at is not null) then
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
  -- A Completed side is locked, its struck cards too (decision 353).
  if exists (select 1 from buy_lines where buy_id = v_old.buy_id and game = v_old.game and completed_at is not null) then
    raise exception 'buy_completed';
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

-- The two re-created functions' grants, as before.
revoke all on function public.scan_claim(uuid, uuid, text, uuid, uuid) from public, anon;
grant execute on function public.scan_claim(uuid, uuid, text, uuid, uuid) to authenticated, service_role;
revoke all on function public.draft_add_line(uuid, jsonb, uuid, boolean, uuid) from public, anon;
grant execute on function public.draft_add_line(uuid, jsonb, uuid, boolean, uuid) to authenticated, service_role;
