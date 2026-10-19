-- 0083: buy numbers in order, without gaps (DESIGN_SPEC decision 349).
--
-- Numbers came from buys_number_seq (0071), and a sequence isn't rolled back: every
-- database test run used up its test buys' numbers, so the real buys ran 1 to 154
-- with 43 of them. The owner (2026-10-19): number new buys the highest so far + 1, and
-- renumber the buys there are, oldest first, with the Changelog to match.
--
--  - internal.next_buy_number(): the higher of the highest buy number and the
--    sequence's value, + 1, under a lock so two confirms never take one number. The
--    sequence is now only a floor that nothing advances in a confirm: a restore raises it
--    past the restored buys (0082), and SETUP.md raises it by hand past numbers on labels
--    after a backup. A rolled-back confirm (a failed save, a test buy) leaves no gap.
--    The database test run's restore test still raises the floor (0082's setval isn't
--    rolled back), so db-test-run.mjs still puts it back afterwards (decision 342).
--  - confirm_buy and project_to_buy take their number from it.
--  - The buys there are become 1, 2, 3… in their present order, and the Changelog
--    entries of each buy (target_id) name its new number. Entries of buys that are gone
--    keep the numbers they were written with.
--  - The floor is set to the highest number, so the next buy follows it.

create or replace function internal.next_buy_number()
 returns integer
 language plpgsql
 set search_path to 'public', 'internal'
as $function$
begin
  -- One confirm at a time takes a number: held till its save ends (decision 349).
  perform pg_advisory_xact_lock(hashtext('pug.buys.number'));
  return greatest(coalesce((select max(number) from buys), 0),
                  (select case when is_called then last_value else last_value - 1 end from buys_number_seq)) + 1;
end;
$function$;
revoke all on function internal.next_buy_number() from public, anon;
grant execute on function internal.next_buy_number() to authenticated, service_role;

-- No buy confirmed meanwhile (the old confirm_buy is in use till this commits).
do $$ begin lock table public.buys in share row exclusive mode; end $$;

-- The buys there are, renumbered in their present order (the order they were confirmed:
-- checked 2026-10-19; only 137 → 42 and 154 → 43 change, the list kept in
-- C:\ClaudeProjects\temp\buy-renumber-2026-10-19.txt).
create temp table pug_renumber as
  select id, row_number() over (order by number)::integer as new from public.buys where number is not null;
update public.buys set number = number + 1000000 where number is not null;   -- out of the way of the unique index
update public.buys b set number = r.new from pug_renumber r where b.id = r.id;

-- Their Changelog entries name their new numbers (the title's "Buy N · day").
update public.events e set target_name = regexp_replace(e.target_name, '^Buy [0-9]+ ', 'Buy ' || r.new || ' ')
  from pug_renumber r
 where e.target_id = r.id and e.target_name ~ '^Buy [0-9]+ ';
drop table pug_renumber;

-- The floor: the highest number now, so the next buy follows it.
select setval('public.buys_number_seq', greatest(coalesce((select max(number) from public.buys), 0), 1),
              (select max(number) from public.buys) is not null);

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
