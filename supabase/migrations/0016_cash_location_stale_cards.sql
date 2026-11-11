-- The three-part patch's one migration (owner, 2026-11-10; decision 580): "I want that plan to include creating only
-- a single combined migration for this 3 part patch." Two of the parts need the database; the in-progress walk-in
-- printout needs nothing here.
--
-- 1. The copy button's row for the store's Google Sheet of buys: where a cash payment went, Till or Backroom ("the
--    two locations are Till and Backroom, but there's also an NA used on credit buys logs"), and who paid an
--    overnight buy, which only the Changelog had. Two columns on buys, cash_location and paid_by. CONFIRM BUY, a
--    project made a buy, and Mark Paid/Ours take the location and keep both; going back to Processing or Priced
--    clears them with the payment. A credit payment never has a location (the check below). A cash one with none
--    is allowed: every buy before this, and the live site between the prod push and the site push, which sends
--    none (every new parameter has a default). The app asks for it on cash.
-- 2. The stale cards: Crystal Commerce's export of the products with no sale in a window (180 days, the search
--    on Inventory), uploaded in Settings. Kept whole, one file at a time, in stale_files and stale_products; written
--    only by stale_file_load, in one call. owned_copies answers which of the card's products are stale, with the
--    recent-export guard: a product we exported since the window began isn't, as it hasn't had time to sell. The
--    file isn't in a backup, as the inventory isn't (backup_export names its tables; backup_columns reads buys'
--    columns by itself, so a backup carries the two new ones).

-- 1. Where the cash went, and who paid ------------------------------------------------------------------------

alter table public.buys add column cash_location text;
alter table public.buys add column paid_by uuid;
alter table public.buys add constraint buys_paid_by_fkey foreign key (paid_by) references staff_users(id);
-- Till or Backroom, on a cash payment only.
alter table public.buys add constraint buys_cash_location_check
  check (cash_location is null or (cash_location in ('till', 'backroom') and paid_method = 'cash'));

-- What's sent, checked: 'till' or 'backroom' (any case, trimmed); null for none, and always null on credit.
create function internal.cash_location(p_location text, p_method text)
returns text
language plpgsql
immutable
set search_path = public, internal
as $$
declare
  v text := lower(nullif(btrim(coalesce(p_location, '')), ''));
begin
  if p_method is distinct from 'cash' then
    return null;
  end if;
  if v is not null and v not in ('till', 'backroom') then
    raise exception 'bad_cash_location';
  end if;
  return v;
end;
$$;
revoke all on function internal.cash_location(text, text) from public, anon;
grant execute on function internal.cash_location(text, text) to authenticated, service_role;

-- Each takes one more parameter, at the end with a default: dropped and made again, so there's one of each.
drop function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, numeric, text, jsonb, text);
CREATE OR REPLACE FUNCTION public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb DEFAULT '{}'::jsonb, p_phone text DEFAULT NULL::text, p_cash_location text DEFAULT NULL::text)
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
  v_location text;
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
  -- Where the cash went, Till or Backroom; none on credit (decision 580). The app requires it on cash.
  v_location := internal.cash_location(p_cash_location, p_paid_method);

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
         cash_location = v_location, paid_by = p_user,
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
revoke all on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, numeric, text, jsonb, text, text) from public, anon;
grant execute on function public.confirm_buy(uuid, uuid, text, text, numeric, numeric, integer, numeric, text, jsonb, text, text) to authenticated, service_role;

drop function public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, numeric, text, text);
CREATE OR REPLACE FUNCTION public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric DEFAULT NULL::numeric, p_offer_credit numeric DEFAULT NULL::numeric, p_paid_price numeric DEFAULT NULL::numeric, p_paid_method text DEFAULT NULL::text, p_reason text DEFAULT NULL::text, p_cash_location text DEFAULT NULL::text)
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
           -- Where the cash went and who paid (decision 580).
           cash_location = internal.cash_location(p_cash_location, p_paid_method), paid_by = p_user,
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.fix_line_rates(b);
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method
               || coalesce(', ' || initcap(b.cash_location), ''));
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
           cash_location = null, paid_by = null,
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
revoke all on function public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, numeric, text, text, text) from public, anon;
grant execute on function public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, numeric, text, text, text) to authenticated, service_role;

drop function public.project_to_buy(uuid, uuid, uuid, text, text, numeric, text, text, numeric, numeric, integer, jsonb);
CREATE OR REPLACE FUNCTION public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb, p_cash_location text DEFAULT NULL::text)
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
  v_location text;
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
  -- As CONFIRM BUY (decision 580).
  v_location := internal.cash_location(p_cash_location, p_paid_method);

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
                    confirmed_at, confirmed_by, paid_at, paid_price, paid_method, cash_location, paid_by,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    created_by, last_edited_by)
  values ('walk_in', 'confirmed', internal.next_buy_number(),   -- the highest + 1 (decision 349)
          v_customer, v_phone, coalesce(btrim(p_notes), ''), p_device,
          now(), p_user, now(), p_paid_price, p_paid_method, v_location, p_user,
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
revoke all on function public.project_to_buy(uuid, uuid, uuid, text, text, numeric, text, text, numeric, numeric, integer, jsonb, text) from public, anon;
grant execute on function public.project_to_buy(uuid, uuid, uuid, text, text, numeric, text, text, numeric, numeric, integer, jsonb, text) to authenticated, service_role;

-- Convert to overnight buy and Convert to project copy the payment onto what they make: the cash location and who
-- paid go with it, so the copied row still has them (the buy is deleted when nothing stays on it). Same parameters.
CREATE OR REPLACE FUNCTION public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  p        buys;
  v_name   text;
  v_target text;
  v_games  text[];
  v_lines  jsonb;
  v_struck jsonb;
  v_gone   integer;
  v_keep   boolean;
  v_done   text[];
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  v_name := btrim(regexp_replace(coalesce(b.customer_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  -- A game with Completed cards stays whole on the buy: its bulk, placeholders and struck cards too (decision 393).
  v_done := array(select distinct game from buy_lines where buy_id = b.id and completed_at is not null);
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g)
    into v_games
    from (select distinct game as g from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
  -- Struck cards stay out of the collection, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null and not (game = any(v_done));

  -- The buy's customer, phone, notes, payment and rates; its user as the maker.
  insert into buys (kind, status, project, customer_name, phone, id_last4, notes, paid_at,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    paid_price, paid_method, cash_location, paid_by, created_by, last_edited_by)
  values ('collection', 'paid', false, v_name, b.phone, '1312', coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.custom_cash_pct, b.custom_credit_pct,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          b.cash_location, b.paid_by,   -- where the cash went and who paid (decision 580)
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;
  -- The buy kept the payment: remembered, for Mark Paid/Ours again (decision 397).
  if v_keep and b.paid_method is not null then
    update buys set kept_buy_id = b.id where id = p.id returning * into p;
  end if;

  -- The cards keep the rates CONFIRM BUY saved on them.
  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));

  perform collection_event(p, p_user, p_device, 'buy_converted_collection', coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = p.id))).cards, 0,
    internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name),
                      jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', '1312')),
    sentence(format('Collection started from %s: %s', v_target, v_name)
             || case when v_gone > 0
                     then '; ' || internal.lines_count_text(array(select l from buy_lines l
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null
                                                                    and not (l.game = any(v_done))),
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
  v_done   text[];
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
  -- A game with Completed cards stays whole on the buy: its bulk, placeholders and struck cards too (decision 393).
  v_done := array(select distinct game from buy_lines where buy_id = b.id and completed_at is not null);
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) then
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
            from buy_lines where buy_id = b.id and completed_at is null and not (game = any(v_done)) group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null and not (game = any(v_done));

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, cash_location, paid_by, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          b.cash_location, b.paid_by,   -- where the cash went and who paid (decision 580)
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;
  -- The buy kept the payment: remembered, for Mark Paid/Ours again (decision 397).
  if v_keep and b.paid_method is not null then
    update buys set kept_buy_id = b.id where id = p.id returning * into p;
  end if;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
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
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null
                                                                    and not (l.game = any(v_done))),
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

-- 2. The stale cards ---------------------------------------------------------------------------------------

-- The file uploaded now, one row (its key is always true).
create table public.stale_files (
  id                boolean primary key default true check (id),
  original_filename text not null,
  days              integer not null check (days between 1 and 3650),
  products          integer not null,
  in_stock          integer not null,
  uploaded_by       uuid references staff_users(id),
  uploaded_at       timestamptz not null default now()
);
-- Its products, as the file has them.
create table public.stale_products (
  product_id   text primary key,
  product_name text not null,
  total_qty    integer
);
alter table public.stale_files enable row level security;
alter table public.stale_products enable row level security;
create policy "store: read" on public.stale_files as permissive for select to authenticated using (true);
create policy "store: read" on public.stale_products as permissive for select to authenticated using (true);
revoke all on table public.stale_files from public, anon, authenticated, service_role;
revoke all on table public.stale_products from public, anon, authenticated, service_role;
grant select on table public.stale_files to authenticated;
grant select on table public.stale_products to authenticated;
grant all on table public.stale_files to service_role;
grant all on table public.stale_products to service_role;

-- The recent-export guard looks a product's exports up by its id.
create index buy_lines_cc_exported on public.buy_lines (cc_product_id, cc_exported_at) where cc_exported_at is not null;

-- The upload: the file replaces the one before, whole, in one call, so a card is never judged on half a file.
-- p_rows: [{product_id, product_name, total_qty}], the CSV's Product ID, Product Name and Total Qty.
create function public.stale_file_load(p_filename text, p_days integer, p_rows jsonb, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  f stale_files;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  -- A user, always (decision 412): the upload is in the Changelog under their name.
  if p_user is null then raise exception 'no_user'; end if;
  if p_days is null or p_days not between 1 and 3650 then raise exception 'bad_days'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'bad_batch';
  end if;
  perform pg_advisory_xact_lock(hashtext('stale_files'));
  -- `where true`: the API may refuse a delete with no where (pg-safeupdate).
  delete from stale_products where true;
  insert into stale_products (product_id, product_name, total_qty)
  select distinct on (btrim(r.product_id)) btrim(r.product_id), r.product_name, r.total_qty
    from jsonb_to_recordset(p_rows) as r(product_id text, product_name text, total_qty integer)
   where nullif(btrim(r.product_id), '') is not null and r.product_name is not null
   order by btrim(r.product_id);
  delete from stale_files where true;
  insert into stale_files (original_filename, days, products, in_stock, uploaded_by)
  values (coalesce(nullif(btrim(p_filename), ''), 'stale cards file'), p_days,
          (select count(*) from stale_products), (select count(*) from stale_products where total_qty > 0), p_user)
  returning * into f;
  perform internal.settings_event(p_user, null, 'stale_file_uploaded', 'Stale cards file', '[]'::jsonb,
    format('Stale cards file uploaded: %s, %s products, %s in stock, no sale in %s days.',
           f.original_filename, f.products, f.in_stock, f.days));
  return jsonb_build_object('uploaded_at', f.uploaded_at, 'products', f.products, 'in_stock', f.in_stock);
end;
$$;
revoke all on function public.stale_file_load(text, integer, jsonb, uuid) from public, anon;
grant execute on function public.stale_file_load(text, integer, jsonb, uuid) to authenticated, service_role;

-- Which of the card's products are stale, beside its counts (decision 580). Same parameters, two more keys.
CREATE OR REPLACE FUNCTION public.owned_copies(p_product_id text, p_base_keys text[], p_name_key text, p_scryfall_id text, p_finish text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with f as (
    select id, uploaded_at from master_inventory_files where is_current limit 1
  ),
  -- The card's products: those of its names, and the printing's own even when staff linked it at export to one
  -- filed under another name (its count is the printing's, so it's the card's too).
  card_products as (
    select p.product_id, p.category, p.product_name, p.total_qty
      from cc_products p join f on p.file_id = f.id
     where p.product_id = p_product_id
        or (p.base_key = any(coalesce(p_base_keys, '{}')) and p.category not like 'Art Series%')
  ),
  -- The stale file (decision 580): its products in stock, of the card's or the printing's own, less any we exported
  -- since its window began (a card just put in stock hasn't had time to sell).
  sf as (
    select uploaded_at, days from stale_files limit 1
  ),
  stale as (
    select s.product_id
      from stale_products s cross join sf
     where s.total_qty > 0
       and (s.product_id in (select product_id from card_products) or s.product_id = p_product_id)
       and not exists (select 1 from buy_lines l
                        where l.cc_product_id = s.product_id
                          and l.cc_exported_at >= sf.uploaded_at - make_interval(days => sf.days))
  ),
  cc as (
    select count(*) as products, count(p.total_qty) as counted, sum(greatest(p.total_qty, 0)) as qty
      from card_products p
  ),
  ours as (
    select l.scryfall_id, l.finish, l.quantity, upper(l.set_code) as set_code, l.set_name, l.collector_number
      from buy_lines l
      join buys b on b.id = l.buy_id
      left join f on true
     where l.game = 'mtg'
       and l.name_key = p_name_key
       and l.bulk_kind is null
       and l.struck_at is null
       and ((b.kind = 'walk_in' and b.status = 'confirmed')
            or (b.kind = 'collection' and b.status in ('paid', 'completed')))
       and not exists (select 1 from buy_lines c where c.source_line_id = l.id)
       and ((l.cc_status is null and l.completed_at is null and b.status <> 'completed')
            or (l.cc_status = 'exported' and l.cc_exported_at > f.uploaded_at))
  )
  select jsonb_build_object(
    'cc_printing', (select case when p.total_qty is not null then greatest(p.total_qty, 0) end from cc_products p join f on p.file_id = f.id where p.product_id = p_product_id),
    'cc_card', (select case when not exists (select 1 from f) or (cc.products > 0 and cc.counted = 0) then null
                            else coalesce(cc.qty, 0) end from cc),
    'ours_printing', (select coalesce(sum(o.quantity), 0) from ours o
                       where o.scryfall_id = p_scryfall_id and o.finish = p_finish),
    'ours_card', (select coalesce(sum(o.quantity), 0) from ours o),
    -- Which printings those are (the owner: "it has to show specifically, which printings we own"), most first:
    'cc_list', (select coalesce(jsonb_agg(jsonb_build_object(
                         'product_id', p.product_id, 'category', p.category, 'name', p.product_name, 'qty', p.total_qty,
                         'this', p.product_id is not distinct from p_product_id)
                       order by p.total_qty desc, p.category, p.product_name, p.product_id), '[]'::jsonb)
                  from card_products p
                 where p.total_qty > 0),
    'ours_list', (select coalesce(jsonb_agg(jsonb_build_object(
                           'scryfall_id', x.scryfall_id, 'set_code', x.set_code, 'set_name', x.set_name,
                           'number', x.collector_number, 'finish', x.finish, 'qty', x.qty,
                           'this', coalesce(x.scryfall_id = p_scryfall_id and x.finish = p_finish, false))
                         -- Collector numbers as numbers: 9 before 10.
                         order by x.qty desc, x.set_code, nullif(substring(x.collector_number from '^[0-9]+'), '')::int,
                                  x.collector_number, x.finish, x.scryfall_id), '[]'::jsonb)
                    from (select o.scryfall_id, o.set_code, max(o.set_name) as set_name, o.collector_number, o.finish,
                                 sum(o.quantity) as qty
                            from ours o
                           group by o.scryfall_id, o.set_code, o.collector_number, o.finish) x),
    'inventory_at', (select f.uploaded_at from f),
    'stale_file', (select jsonb_build_object('days', sf.days, 'uploaded_at', sf.uploaded_at) from sf),
    'stale_ids', (select coalesce(jsonb_agg(s.product_id order by s.product_id), '[]'::jsonb) from stale s))
$function$;
