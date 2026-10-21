-- PUG Pricing Tool: the database test run (docs/TEST.md, section 21).
--
-- Calls every server function the app uses, as the app's own signed-in role
-- (authenticated), and checks what each one does and what it refuses. It all
-- runs in ONE transaction that is rolled back at the end, so nothing it makes
-- is kept: no buys, collections, users, computers, inventory or settings.
-- (The only trace: the Changelog's numbering skips the numbers its entries
-- used. Buy numbers are used up too, as a sequence isn't rolled back, so
-- db-test-run.mjs puts buys_number_seq back afterwards: decision 342.) It also prints fingerprints of the database's structure, so a run on
-- prod after the migration squash can be compared with a run on dev.
--
-- Run it with scripts/db-test-run.mjs, which checks which project is linked,
-- prints the results and checks that nothing was left behind:
--   node scripts/db-test-run.mjs
--
-- While it runs (under a minute) the restore test holds its tables, and from its
-- first test buy it holds the buy-number lock (decision 349), so another
-- computer saving something, a CONFIRM BUY above all, waits until it's done
-- (or fails, if it waits too long): run it when the store isn't using the app. It reads no secrets and prints no customer data: every
-- name it makes starts with DBTEST.

begin;

-- ---------------------------------------------------------------- the kit
create temp table dbt (n serial primary key, section text not null, name text not null,
                       ok boolean not null, detail text);
create temp table dbt_ctx (k text primary key, v text);
grant all on dbt, dbt_ctx to public;
grant all on sequence dbt_n_seq to public;

-- One result.
create function pg_temp.ok(p_section text, p_name text, p_ok boolean, p_detail text default null)
returns void language sql as $f$
  insert into pg_temp.dbt (section, name, ok, detail) values (p_section, p_name, coalesce(p_ok, false), p_detail)
$f$;
-- A refusal: the error the call raised (dbt_no_error when it raised none) against the one expected.
create function pg_temp.err(p_section text, p_name text, p_got text, p_want text)
returns void language sql as $f$
  select pg_temp.ok(p_section, p_name, p_got = p_want,
    case when p_got = p_want then null
         when p_got = 'dbt_no_error' then 'no error; expected ' || p_want
         else 'expected ' || p_want || ', got: ' || p_got end)
$f$;
-- A section that stopped on an unexpected error (its other results are lost with it).
create function pg_temp.crashed(p_section text, p_msg text, p_ctx text)
returns void language sql as $f$
  select pg_temp.ok(p_section, 'ran to the end', false, left(p_msg || ' | ' || coalesce(p_ctx, ''), 600))
$f$;
-- IDs handed from one section to the next.
create function pg_temp.put(p_k text, p_v text) returns void language sql as $f$
  insert into pg_temp.dbt_ctx values (p_k, p_v) on conflict (k) do update set v = excluded.v
$f$;
create function pg_temp.id(p_k text) returns uuid language sql stable as $f$
  select v::uuid from pg_temp.dbt_ctx where k = p_k
$f$;
create function pg_temp.version(p_buy uuid) returns integer language sql stable as $f$
  select version from public.buys where id = p_buy
$f$;
-- A card line as the app sends it.
create function pg_temp.line(p_name text, p_set text, p_num text, p_qty integer, p_price numeric,
                             p_game text default 'mtg', p_finish text default null, p_cond text default 'NM')
returns jsonb language sql stable as $f$
  select jsonb_build_object(
    'game', p_game, 'lang', 'en', 'name', p_name, 'name_key', lower(p_name),
    'set_code', p_set, 'set_name', 'DBTEST ' || p_set, 'collector_number', p_num,
    'finish', coalesce(p_finish, case when p_game = 'mtg' then 'nonfoil' else 'holo' end),
    'first_edition', false, 'treatments', '[]'::jsonb, 'condition', p_cond,
    'quantity', p_qty, 'unit_price', p_price, 'market_price', p_price * 2,
    'price_source', case when p_game = 'mtg' then 'justtcg' else 'tcgdex_fallback' end,
    'priced_at', now(),
    'scryfall_id', case when p_game = 'mtg' then 'dbtest-' || lower(p_set) || '-' || p_num end,
    'tcgdex_id', case when p_game = 'pokemon' then 'dbtest-' || lower(p_set) || '-' || p_num end)
$f$;
-- A confirmed walk-in buy of the given lines (master rates 50/65, $1 cash).
create function pg_temp.buy(p_dev uuid, p_user uuid, p_name text, p_phone text, p_lines jsonb[])
returns uuid language plpgsql as $f$
declare
  v uuid;
  x jsonb;
begin
  v := draft_for_device(p_dev, p_user);
  foreach x in array p_lines loop
    perform draft_add_line(p_dev, x, p_user, false);
  end loop;
  perform confirm_buy(v, p_user, p_name, '', 50, 65, null, 1, 'cash', '{}', p_phone);
  return v;
end
$f$;
-- A line of a buy by its name (and finish).
create function pg_temp.line_id(p_buy uuid, p_name text, p_finish text default null)
returns uuid language sql stable as $f$
  select id from public.buy_lines where buy_id = p_buy and name = p_name
     and (p_finish is null or finish = p_finish) order by position limit 1
$f$;
-- Export matches: each line to a product at a Sell Price.
create function pg_temp.match(p_line uuid, p_product text, p_price numeric, p_link text default 'staff')
returns jsonb language sql immutable as $f$
  select jsonb_build_object('line_id', p_line, 'product_id', p_product, 'sell_price', p_price,
                            'sell_basis', jsonb_build_object('test', 'dbtest'), 'link', p_link)
$f$;

-- A bulk line as the app sends it (bulk.js buildBulkLine; 0058).
create function pg_temp.bulk(p_kind text, p_qty integer, p_value numeric)
returns jsonb language sql immutable as $f$
  select jsonb_build_object(
    'game', case when p_kind like 'pkm%' then 'pokemon' else 'mtg' end, 'lang', 'en', 'bulk_kind', p_kind,
    'name', 'DBTEST ' || p_kind, 'name_key', 'dbtest ' || p_kind, 'set_code', 'BULK', 'set_name', 'Bulk',
    'collector_number', '', 'finish', case when p_kind like 'pkm%' then 'normal' else 'nonfoil' end,
    'first_edition', false, 'treatments', '[]'::jsonb, 'condition', 'NM',
    'quantity', p_qty, 'unit_price', p_value, 'market_price', p_value, 'price_source', 'bulk', 'priced_at', now())
$f$;

grant execute on function pg_temp.ok(text, text, boolean, text), pg_temp.err(text, text, text, text),
  pg_temp.crashed(text, text, text), pg_temp.put(text, text), pg_temp.id(text), pg_temp.version(uuid),
  pg_temp.line(text, text, text, integer, numeric, text, text, text),
  pg_temp.buy(uuid, uuid, text, text, jsonb[]), pg_temp.line_id(uuid, text, text),
  pg_temp.match(uuid, text, numeric, text), pg_temp.bulk(text, integer, numeric) to public;


-- ======================================================= Structure (as the owner)
-- Fingerprints: the same on dev and prod when their structure is the same.
do $$
declare
  s text := 'Fingerprints';
  v_hash text;
  v_n integer;
  v_all text := '';
begin
  select md5(string_agg(pg_get_functiondef(p.oid), E'\n' order by ns.nspname, p.proname,
                        pg_get_function_identity_arguments(p.oid))), count(*)
    into v_hash, v_n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal');
  perform pg_temp.ok(s, format('Server functions (%s)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(string_agg(format('%s.%s.%s %s %s %s', table_schema, table_name, column_name, data_type,
                               coalesce(column_default, ''), is_nullable), E'\n'
                        order by table_schema, table_name, column_name)), count(distinct table_name)
    into v_hash, v_n
    from information_schema.columns where table_schema in ('public', 'internal');
  perform pg_temp.ok(s, format('Tables and columns (%s tables)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(string_agg(d, E'\n' order by d)), count(*) into v_hash, v_n
    from (select conrelid::regclass::text || ' ' || pg_get_constraintdef(oid) as d
            from pg_constraint where connamespace = 'public'::regnamespace) x;
  perform pg_temp.ok(s, format('Constraints (%s)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(string_agg(d, E'\n' order by d)), count(*) into v_hash, v_n
    from (select regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE \1INDEX ON ') as d
            from pg_indexes where schemaname = 'public') x;
  perform pg_temp.ok(s, format('Indexes (%s)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(string_agg(d, E'\n' order by d)), count(*) into v_hash, v_n
    from (select format('%s %s %s %s %s %s', tablename, policyname, cmd, roles, qual, with_check) as d
            from pg_policies where schemaname = 'public') x;
  perform pg_temp.ok(s, format('Row security policies (%s)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(coalesce(string_agg(d, E'\n' order by d), '')), count(*) into v_hash, v_n
    from (select pg_get_triggerdef(t.oid) as d
            from pg_trigger t join pg_class c on c.oid = t.tgrelid
           where c.relnamespace = 'public'::regnamespace and not t.tgisinternal) x;
  perform pg_temp.ok(s, format('Triggers (%s)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  select md5(string_agg(d, E'\n' order by d)) into v_hash
    from (select format('%s.%s(%s) %s', ns.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
                        coalesce(p.proacl::text, 'default')) as d
            from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname in ('public', 'internal')
          union all
          select format('%s %s', c.relname, coalesce(c.relacl::text, 'default'))
            from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'S', 'v')
          union all
          -- Only ours: `public` is Supabase's schema, which the baseline never writes (db-baseline.mjs),
          -- so its grants may differ between projects without anything being wrong.
          select format('schema %s %s', nspname, nspacl) from pg_namespace where nspname = 'internal') x;
  perform pg_temp.ok(s, 'Privileges', true, v_hash);
  v_all := v_all || v_hash;

  select md5(coalesce(string_agg(schemaname || '.' || tablename, ',' order by schemaname, tablename), '')), count(*)
    into v_hash, v_n
    from pg_publication_tables where pubname = 'supabase_realtime';
  perform pg_temp.ok(s, format('Live updates (%s tables)', v_n), true, v_hash);
  v_all := v_all || v_hash;

  perform pg_temp.ok(s, 'All of the above', true, md5(v_all));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ======================================================== Security (as the owner)
do $$
declare
  s text := 'Security';
  v text;
begin
  select string_agg(relname, ', ' order by relname) into v
    from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity;
  perform pg_temp.ok(s, 'Every table has row security on', v is null, v);

  select string_agg(tablename || ' ' || policyname, ', ') into v
    from pg_policies where schemaname = 'public' and not roles <@ array['authenticated']::name[];
  perform pg_temp.ok(s, 'Only the signed-in role has policies (none for anon)', v is null, v);

  select string_agg(ns.nspname || '.' || p.proname, ', ' order by ns.nspname || '.' || p.proname) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal')
     and has_function_privilege('anon', p.oid, 'EXECUTE') and has_schema_privilege('anon', ns.oid, 'USAGE');
  perform pg_temp.ok(s, 'Signed out (anon), no server function can be run', v is null, v);

  select string_agg(ns.nspname || '.' || p.proname, ', ' order by ns.nspname || '.' || p.proname) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal')
     and (p.proacl is null
          or exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  perform pg_temp.ok(s, 'No server function is open to everyone (PUBLIC)', v is null, v);

  perform pg_temp.ok(s, 'Signed out, the internal schema can''t be used',
    not has_schema_privilege('anon', 'internal', 'USAGE'));

  -- 0003: Supabase's default grants had opened the buy number counter to anon.
  perform pg_temp.ok(s, 'Signed out, neither counter can be used',
    not has_sequence_privilege('anon', 'public.buys_number_seq', 'USAGE')
    and not has_sequence_privilege('anon', 'public.buys_number_seq', 'UPDATE')
    and not has_sequence_privilege('anon', 'public.events_seq_seq', 'USAGE'));

  -- 0002: the Changelog is written only by the database (decision 378).
  perform pg_temp.ok(s, 'The Changelog can only be read by the app',
    not has_table_privilege('authenticated', 'public.events', 'INSERT')
    and not has_table_privilege('authenticated', 'public.events', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.events', 'DELETE')
    and has_table_privilege('authenticated', 'public.events', 'SELECT')
    and not has_sequence_privilege('authenticated', 'public.events_seq_seq', 'USAGE')
    and not has_sequence_privilege('authenticated', 'public.events_seq_seq', 'UPDATE')
    and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'events'
                     and policyname = 'store: append'));

  select string_agg(p.proname, ', ' order by p.proname) into v
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  perform pg_temp.ok(s, 'The app can run every public function but restore_rows', v = 'restore_rows', v);

  select string_agg(ns.nspname || '.' || p.proname, ', ' order by ns.nspname || '.' || p.proname) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal') and p.prosecdef;
  perform pg_temp.ok(s, 'Only the expected functions run with the owner''s rights',
    -- internal.request_begin / request_end (0004): the only way to the done requests, which the app can't read.
    v = 'internal.insert_event, internal.remember_customer, internal.request_begin, internal.request_end, '
        || 'public.cc_products_load, public.master_inventory_abort, public.master_inventory_finish, public.restore_backup', v);

  select string_agg(ns.nspname || '.' || p.proname, ', ' order by ns.nspname || '.' || p.proname) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal')
     and not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%');
  perform pg_temp.ok(s, 'Every function has a fixed search path', v is null, v);

  perform pg_temp.ok(s, 'The stored API key can''t be read, signed in or out',
    not has_table_privilege('authenticated', 'public.secrets', 'SELECT')
    and not has_table_privilege('anon', 'public.secrets', 'SELECT')
    and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'secrets'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- Signed out: nothing to see, nothing to run.
set local role anon;
do $$
declare
  s text := 'Security';
  v integer;
begin
  begin
    select count(*) into v from buys;
    perform pg_temp.ok(s, 'Signed out, no buys can be seen', v = 0, v || ' seen');
  exception when insufficient_privilege then
    perform pg_temp.ok(s, 'Signed out, no buys can be seen', true);
  end;
  begin
    perform draft_for_device(gen_random_uuid(), null);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Signed out, a server function is refused', sqlstate = '42501', sqlerrm);
  end;
end $$;
reset role;

-- From here on, as the app: the signed-in role.
select pg_temp.put('events_seq_start', (select last_value::text from events_seq_seq));
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000d0b7","role":"authenticated"}', true);

do $$
declare
  s text := 'Security';
  v integer;
begin
  begin
    perform 1 from secrets limit 1;
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Signed in, the stored API key is still refused', sqlstate = '42501', sqlerrm);
  end;
  begin
    update events set summary = summary where seq = (select max(seq) from events);
    get diagnostics v = row_count;
    perform pg_temp.ok(s, 'The Changelog can''t be edited', v = 0, v || ' edited');
  exception when insufficient_privilege then
    perform pg_temp.ok(s, 'The Changelog can''t be edited', true);
  end;
  begin
    delete from events where seq = (select max(seq) from events);
    get diagnostics v = row_count;
    perform pg_temp.ok(s, 'The Changelog can''t be deleted', v = 0, v || ' deleted');
  exception when insufficient_privilege then
    perform pg_temp.ok(s, 'The Changelog can''t be deleted', true);
  end;
  begin
    insert into events (kind, action) values ('app', 'dbtest');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'The Changelog is only written by the server (0002)', sqlstate = '42501', sqlerrm);
  end;
  begin
    perform nextval('events_seq_seq');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'The Changelog''s counter is only moved by the server (0002)', sqlstate = '42501', sqlerrm);
  end;
  begin
    insert into customers (name_key, name) values ('dbtest x', 'DBTEST X');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Past customers are only written by the server', sqlstate = '42501', sqlerrm);
  end;
  begin
    insert into price_cache (key, game, payload) values ('dbtest', 'mtg', '{}');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'The price cache is only written by the server', sqlstate = '42501', sqlerrm);
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================================================ Helpers
do $$
declare
  s text := 'Helpers';
begin
  perform pg_temp.ok(s, 'round_down_price steps: 0.99 · 1.37 · 12.34 · 123.45 · 1,234.56',
    round_down_price(0.99) = 0.99 and round_down_price(1.37) = 1.25 and round_down_price(12.34) = 12
    and round_down_price(123.45) = 120 and round_down_price(1234.56) = 1230,
    concat_ws(' · ', round_down_price(0.99), round_down_price(1.37), round_down_price(12.34),
              round_down_price(123.45), round_down_price(1234.56)));
  perform pg_temp.ok(s, 'money_text', money_text(5) = '$5' and money_text(5.5) = '$5.50'
    and money_text(1234.5) = '$1,234.50' and money_text(null) is null);
  perform pg_temp.ok(s, 'pct_text', pct_text(33.0) = '33' and pct_text(33.50) = '33.5');
  perform pg_temp.ok(s, 'format_phone', format_phone('5551234567') = '(555) 123-4567' and format_phone('123') = '123');
  perform pg_temp.ok(s, 'sentence', sentence('Done') = 'Done.' and sentence('Done.') = 'Done.');
  perform pg_temp.ok(s, 'status_label', status_label('paid') = 'Paid/Ours' and status_label('rejected') = 'Rejected'
    and status_label('processing') = 'Processing' and status_label('priced') = 'Priced'
    and status_label('completed') = 'Completed');
  perform pg_temp.ok(s, 'cc_condition_word', cc_condition_word('NM') = 'Near Mint'
    and cc_condition_word('LP') = 'Lightly Played' and cc_condition_word('MP') = 'Moderately Played'
    and cc_condition_word('HP') = 'Heavily Played' and cc_condition_word('DMG') = 'Damaged');
  perform pg_temp.ok(s, 'cant_upload_note', length(cant_upload_note()) > 40);
  perform pg_temp.ok(s, 'count_text: cards and bulk apart, as CONFIRM BUY says it (0066)',
    internal.count_text(7, 100) = '7 cards + 100 bulk' and internal.count_text(1, 0) = '1 card'
    and internal.count_text(0, 1500) = '1,500 bulk' and internal.count_text(0, 0) = '0 cards'
    and internal.count_text(2, 0, 'struck') = '2 struck cards' and internal.count_text(0, 100, 'struck') = '100 struck bulk',
    concat_ws(' · ', internal.count_text(7, 100), internal.count_text(0, 1500), internal.count_text(0, 100, 'struck')));
  perform pg_temp.ok(s, 'bulk_per: cards in a bulk item; none for a card or a placeholder',
    internal.bulk_per('mtg_100_common') = 100 and internal.bulk_per('pkm_10_fifty') = 10
    and internal.bulk_per('pkm_placeholder') is null and internal.bulk_per(null) is null);
  perform pg_temp.ok(s, 'norm_number drops leading zeros', internal.norm_number('007') = '7'
    and internal.norm_number('SV-007') = 'sv-7' and internal.norm_number('TG07') = 'tg7'
    and internal.norm_number('0') = '0');
  perform pg_temp.ok(s, 'Custom SKU is the date: 61726 for June 17, 2026',
    internal.cc_custom_sku(timestamptz '2026-06-17 12:00 America/Los_Angeles') = '61726'
    and internal.cc_custom_sku(timestamptz '2026-10-12 23:30 America/Los_Angeles') = '101226',
    internal.cc_custom_sku(timestamptz '2026-06-17 12:00 America/Los_Angeles'));
  perform pg_temp.ok(s, 'customer_name tidies spaces', internal.customer_name('  Ash   Ketchum ') = 'Ash Ketchum'
    and internal.customer_key(' Ash  KETCHUM') = 'ash ketchum');
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ===================================================== Staff and computers
do $$
declare
  s text := 'Staff & computers';
  v_u1 uuid;
  v_u2 uuid;
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
begin
  insert into staff_users (name, color) values ('DBTEST Cashier', 'pal-teal') returning id into v_u1;
  insert into staff_users (name, color) values ('DBTEST Second', 'pal-violet') returning id into v_u2;
  insert into devices (id, label) values (v_a, 'DBTEST Computer A'), (v_b, 'DBTEST Computer B');
  perform pg_temp.put('u1', v_u1::text);
  perform pg_temp.put('u2', v_u2::text);
  perform pg_temp.put('devA', v_a::text);
  perform pg_temp.put('devB', v_b::text);
  perform pg_temp.ok(s, 'Two users and two computers are added', true);
  begin
    insert into staff_users (name, color) values ('  dbtest cashier ', 'pal-teal');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Two users can''t share a name', sqlstate = '23505', sqlerrm);
  end;
  begin
    insert into staff_users (name, color) values ('DBTEST Third', 'pal-neon');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'A colour has to be one of the palette''s', sqlstate = '23514', sqlerrm);
  end;
  begin
    insert into devices (id, label) values (gen_random_uuid(), '   ');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'A computer needs a name', sqlstate = '23514', sqlerrm);
  end;
  -- Known Master Buy Percentages for the rest of the run: 50% cash, 65% credit.
  insert into settings (key, value, updated_by) values ('cash_pct', '50', v_u1), ('credit_pct', '65', v_u1)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
  perform pg_temp.ok(s, 'Master Buy Percentages are saved', master_pct('cash_pct') = 50 and master_pct('credit_pct') = 65);
  -- The low-end and high-end rates (0055) out of the way for the sections
  -- written before them, so every card there is on one rate: nothing is
  -- under $0 or over $1,000,000. Individual rates sets real ones.
  insert into settings (key, value, updated_by)
  values ('rate_tiers', '{"low": {"under": 0, "credit": 50, "cash": 25}, "high": {"over": 1000000, "credit": 70, "cash": 40}}', v_u1)
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================================================ Buy tab
do $$
declare
  s text := 'Buy tab';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  v_buy uuid;
  v_empty uuid;
  l1 uuid;
  l2 uuid;
  lp uuid;
  v_id uuid;
  v_ver integer;
  v_res jsonb;
  v_n integer;
begin
  v_buy := draft_for_device(a, u);
  perform pg_temp.ok(s, 'A computer gets a draft',
    (select kind = 'walk_in' and status = 'draft' and draft_device_id = a from buys where id = v_buy));
  perform pg_temp.ok(s, 'The same draft comes back', draft_for_device(a, u) = v_buy);

  l1 := draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00), u, true);
  perform pg_temp.ok(s, 'A card is added', (select quantity = 2 and position = 1 from buy_lines where id = l1));
  v_id := draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u, true);
  perform pg_temp.ok(s, 'The same card again adds to its line',
    v_id = l1 and (select quantity from buy_lines where id = l1) = 3);
  l2 := draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00, p_cond => 'LP'), u, true);
  perform pg_temp.ok(s, 'Another condition is a line of its own', l2 <> l1);
  lp := draft_add_line(a, pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon'), u, true);
  perform pg_temp.ok(s, 'A Pokémon card goes on the same buy', (select game = 'pokemon' from buy_lines where id = lp));
  begin
    perform draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 0, 1.00), u, true);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Quantity 0 is refused', sqlerrm, 'quantity must be at least 1');
  end;

  v_id := draft_update_line(l2, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u);
  perform pg_temp.ok(s, 'Editing a card into a copy of another merges them',
    v_id = l1 and (select quantity from buy_lines where id = l1) = 4
    and not exists (select 1 from buy_lines where id = l2));
  begin
    perform draft_update_line(l2, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Editing a card that''s gone is refused', sqlerrm, 'line_gone');
  end;
  perform draft_remove_line(l1, 1, u);
  perform pg_temp.ok(s, 'Removing one copy leaves the rest', (select quantity from buy_lines where id = l1) = 3);

  perform draft_set_custom_rates(a, 55, 70, u);
  perform pg_temp.ok(s, 'Custom rates are kept on the draft',
    (select custom_cash_pct = 55 and custom_credit_pct = 70 from buys where id = v_buy));
  perform draft_set_custom_rates(a, null, null, u);

  v_ver := pg_temp.version(v_buy);
  begin
    perform confirm_buy(v_buy, u, '   ', '', 50, 65, v_ver, 10, 'cash', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'CONFIRM BUY needs a name', sqlerrm, 'name_needed');
  end;
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, v_ver, 10, 'cash', '{}', null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a phone number', sqlerrm, 'phone_needed');
  end;
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, v_ver, 10, 'cash', '{}', '555 0100');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a whole phone number', sqlerrm, 'bad_phone');
  end;
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, v_ver, null, 'cash', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the price paid', sqlerrm, 'paid_price_needed');
  end;
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, v_ver, 10, 'venmo', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… cash or credit', sqlerrm, 'paid_method_needed');
  end;
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, v_ver - 1, 10, 'cash', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the buy as it is now (another tab changed it)', sqlerrm, 'stale_version');
  end;
  v_empty := draft_for_device(bd, u);
  begin
    perform confirm_buy(v_empty, u, 'DBTEST Ash', '', 50, 65, null, 0, 'cash', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a card', sqlerrm, 'empty_buy');
  end;
  perform draft_cancel(v_empty);
  perform pg_temp.ok(s, 'Cancel deletes a draft', not exists (select 1 from buys where id = v_empty));

  v_res := confirm_buy(v_buy, u, 'DBTEST Ash', ' first visit ', 50, 65, v_ver, 9.5, 'cash',
                       jsonb_build_object(l1::text, '3 Dbtest Bolt (DBT) 001'), '1 (555) 010-0001');
  perform pg_temp.ok(s, 'CONFIRM BUY confirms it as entered',
    (select status = 'confirmed' and confirmed_by = u and customer_name = 'DBTEST Ash' and notes = 'first visit'
            and phone = '5550100001' and paid_price = 9.5 and paid_method = 'cash' and paid_at is not null
            and cash_pct = 50 and credit_pct = 65 from buys where id = v_buy));
  select number into v_n from buys where id = v_buy;
  perform pg_temp.ok(s, 'It answers with its number, the next ever (0071)',
    v_n >= 1 and v_n = (select max(number) from buys)
    and (v_res ->> 'number')::integer = v_n and v_res -> 'games' = '["mtg", "pokemon"]'::jsonb
    and v_res ->> 'target_name' = internal.buy_target_name(v_buy), v_res::text);
  perform pg_temp.ok(s, 'The Changelog has it, with its totals',
    exists (select 1 from events where action = 'buy_confirmed' and target_id = v_buy and added = 4
              and (totals ->> 'market')::numeric = 7 and (totals ->> 'cash')::numeric = 3.5
              and (totals ->> 'credit')::numeric = 4.5
              and summary = '4 cards bought from DBTEST Ash, (555) 010-0001; paid $9.50 in cash.'
              and lines @> '[{"text": "3 Dbtest Bolt (DBT) 001"}]'),
    (select summary || ' ' || totals::text from events where action = 'buy_confirmed' and target_id = v_buy));
  perform pg_temp.ok(s, 'The customer is remembered with the phone',
    exists (select 1 from customers where name_key = 'dbtest ash' and name = 'DBTEST Ash' and phone = '5550100001'));
  begin
    perform confirm_buy(v_buy, u, 'DBTEST Ash', '', 50, 65, null, 10, 'cash', '{}', '5550100001');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'It can''t be confirmed twice', sqlerrm, 'stale_version');
  end;
  perform draft_cancel(v_buy);
  perform draft_remove_line(l1, 1, u);
  perform pg_temp.ok(s, 'Draft tools leave a confirmed buy alone',
    exists (select 1 from buys where id = v_buy) and (select quantity from buy_lines where id = l1) = 3);
  perform pg_temp.ok(s, 'A new draft starts after it', draft_for_device(a, u) <> v_buy);
  perform draft_cancel(draft_for_device(a, u));

  perform pg_temp.put('buy1', v_buy::text);
  perform pg_temp.put('buy1_bolt', l1::text);
  perform pg_temp.put('buy1_pika', lp::text);
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- =============================================================== Day page
do $$
declare
  s text := 'Day page';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid := pg_temp.id('buy1');
  l1 uuid := pg_temp.id('buy1_bolt');
  lp uuid := pg_temp.id('buy1_pika');
  v_b2 uuid;
  v_cb uuid;
  v_cp uuid;
  l uuid;
  v_n integer;
begin
  begin
    perform buy_remove_line(l1, 1, null, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Removing a card needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_remove_line(gen_random_uuid(), 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Removing a card that''s gone is refused', sqlerrm, 'line_gone');
  end;
  begin
    perform buy_remove_line(l1, 1, u, a, pg_temp.version(b) - 1, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Removing from an old copy of the buy is refused', sqlerrm, 'stale_version');
  end;
  perform buy_remove_line(l1, 1, u, a, pg_temp.version(b), '1 Dbtest Bolt (DBT) 001');
  perform pg_temp.ok(s, 'A card comes off a confirmed buy', (select quantity from buy_lines where id = l1) = 2);
  perform pg_temp.ok(s, 'The Changelog says which buy',
    exists (select 1 from events where action = 'buy_cards_removed' and target_id = b and removed = 1
              and target_name = internal.buy_target_name(b) and summary = '1 card removed from a confirmed buy.'));

  v_n := buy_mark_completed(b, 'mtg', u, a, true, pg_temp.version(b));
  perform pg_temp.ok(s, 'Mark as completed (Magic) completes just the Magic cards, and strikes them (0073)',
    v_n = 1 and (select completed_at is not null and struck_at = completed_at from buy_lines where id = l1)
    and (select completed_at is null and struck_at is null from buy_lines where id = lp));
  perform pg_temp.ok(s, 'The calendar sees it',
    (select games = array['mtg', 'pokemon'] and completed_games = array['mtg'] and exported_games = '{}'
       from buys_in_range(now() - interval '1 minute', now() + interval '1 minute') where id = b));
  perform pg_temp.ok(s, 'The everyday search leaves completed cards out; the full one shows them',
    not exists (select 1 from global_search('dbtest bolt', null, null, null, false) where line_id = l1)
    and exists (select 1 from global_search('dbtest bolt', null, null, null, true, true) where line_id = l1 and completed));
  begin
    perform buy_remove_line(l1, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A completed card can''t be removed', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_delete(b, u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A buy with completed cards can''t be deleted', sqlerrm, 'buy_completed');
  end;
  -- Convert to project skips Completed cards (0073): the live ones move, the buy stays with the rest.
  v_cb := pg_temp.buy(a, u, 'DBTEST Half Done', '5550100012', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  perform pg_temp.ok(s, 'A confirmed buy takes the highest number so far + 1: no gaps (0083)',
    (select number from buys where id = v_cb) = (select max(number) from buys where id <> v_cb) + 1);
  -- A confirm rolled back leaves no gap; a deleted newest buy's number is the next one's.
  v_n := (select number from buys where id = v_cb);
  begin
    perform pg_temp.buy(a, u, 'DBTEST Rolled Back', '5550100014', array[pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)]);
    raise exception 'dbt_undo';
  exception when others then perform pg_temp.err(s, 'A test buy confirmed, then rolled back (0083)', sqlerrm, 'dbt_undo');
  end;
  v_cp := pg_temp.buy(a, u, 'DBTEST After Rollback', '5550100015', array[pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)]);
  perform pg_temp.ok(s, '… a confirm that was rolled back leaves no gap (0083)', (select number from buys where id = v_cp) = v_n + 1);
  perform buy_delete(v_cp, u, a, null);
  v_cp := pg_temp.buy(a, u, 'DBTEST After Delete', '5550100015', array[pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)]);
  perform pg_temp.ok(s, '… and the newest buy deleted, its number is the next one''s', (select number from buys where id = v_cp) = v_n + 1);
  perform buy_delete(v_cp, u, a, null);
  perform buy_mark_completed(v_cb, 'mtg', u, a, true);
  v_cp := buy_to_project(v_cb, 'DBTEST Half Project', u, a);
  perform pg_temp.ok(s, 'Convert to project moves the live cards; Completed ones stay, and so does the buy',
    (select count(*) from buy_lines where buy_id = v_cp) = 1
    and (select count(*) from buy_lines where buy_id = v_cb and completed_at is not null) = 1
    and exists (select 1 from buys where id = v_cb)
    and exists (select 1 from events where action = 'buy_converted' and target_id = v_cp
                  and summary like 'Project started from Buy % · %: DBTEST Half Project; its Completed cards stay on the buy.'));
  perform pg_temp.ok(s, '… and the payment stays on the buy: the project is paid $0, the method kept (0079)',
    (select paid_price = 0 and paid_method = 'cash' from buys where id = v_cp)
    and (select paid_price = 1 and paid_method = 'cash' from buys where id = v_cb));
  v_cb := pg_temp.buy(a, u, 'DBTEST Half Kept', '5550100013', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  perform buy_mark_completed(v_cb, 'mtg', u, a, true);
  v_cp := buy_to_collection(v_cb, u, a);
  perform pg_temp.ok(s, 'Convert to collection with the buy staying: the payment stays on the buy too (0079)',
    (select paid_price = 0 and paid_method = 'cash' and status = 'paid' from buys where id = v_cp)
    and (select paid_price = 1 and paid_method = 'cash' from buys where id = v_cb));
  begin
    perform buy_to_project(v_cb, 'DBTEST X', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and refuses when nothing is left to move', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_mark_completed(b, 'chess', u, a, true);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only Magic or Pokémon', sqlerrm, 'bad_game');
  end;
  perform pg_temp.ok(s, 'Completing twice changes nothing', buy_mark_completed(b, 'mtg', u, a, true) = 0);
  v_n := buy_mark_completed(b, 'mtg', u, a, false);
  perform pg_temp.ok(s, 'Paid/Ours again puts it back, unstruck', v_n = 1 and (select completed_at is null and struck_at is null from buy_lines where id = l1));

  perform pg_temp.ok(s, 'Search finds it by name, with its buy number',
    exists (select 1 from global_search('DBTEST BOLT', null, null, null, false)
             where line_id = l1 and kind = 'walk_in' and collection_kind is null and buy_number >= 1));
  perform pg_temp.ok(s, '… by number, leading zeros or not, and set',
    exists (select 1 from global_search(null, '1', null, 'dbt', false) where line_id = l1)
    and exists (select 1 from global_search('', '0001', null, 'DBT', false) where line_id = l1));
  perform pg_temp.ok(s, '… and takes a % literally',
    not exists (select 1 from global_search('dbtest%bolt', null, null, null, true)));
  perform pg_temp.ok(s, 'Its set is in the search''s set list', 'dbt' = any(search_set_codes()));

  -- A buy of one card, to delete.
  v_b2 := pg_temp.buy(a, u, 'DBTEST Misty', '5550100002', array[pg_temp.line('Dbtest Counterspell', 'DBT', '002', 1, 2.00)]);
  l := pg_temp.line_id(v_b2, 'Dbtest Counterspell');
  begin
    perform buy_remove_line(l, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A buy''s last card can''t be removed (delete the buy)', sqlerrm, 'last_card');
  end;
  begin
    perform buy_delete(v_b2, null, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Deleting needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_delete(v_b2, u, a, pg_temp.version(v_b2) - 1);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Deleting an old copy is refused', sqlerrm, 'stale_version');
  end;
  perform buy_delete(v_b2, u, a, pg_temp.version(v_b2), jsonb_build_object(l::text, '1 Dbtest Counterspell (DBT) 002'));
  perform pg_temp.ok(s, 'A buy is deleted with its cards',
    not exists (select 1 from buys where id = v_b2) and not exists (select 1 from buy_lines where id = l));
  perform pg_temp.ok(s, 'The Changelog keeps what it had',
    exists (select 1 from events where action = 'buy_deleted' and target_id = v_b2 and removed = 1
              and summary = 'Buy deleted with 1 card.' and lines @> '[{"text": "1 Dbtest Counterspell (DBT) 002"}]'));
  begin
    perform buy_delete(v_b2, u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Deleting it again is refused', sqlerrm, 'buy_gone');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ========================================= Edit in project view (SAVE BUY)
do $$
declare
  s text := 'Buy edits';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid;
  bolt uuid;
  pika uuid;
  v_ver integer;
  v_target text;
  v_line jsonb;
begin
  b := pg_temp.buy(a, u, 'DBTEST Edits', '5550100012', array[
         pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00),
         pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  bolt := pg_temp.line_id(b, 'Dbtest Bolt');
  pika := pg_temp.line_id(b, 'Dbtestchu');
  v_ver := pg_temp.version(b);
  v_line := pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 0.90, p_cond => 'LP');
  begin
    perform buy_save_edits(b, null, a, v_ver, jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line)), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'SAVE BUY needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_save_edits(b, u, a, v_ver - 1, jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line)), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the buy as it is now', sqlerrm, 'stale_version');
  end;
  begin
    perform buy_save_edits(b, u, a, v_ver, jsonb_build_array(jsonb_build_object('id', gen_random_uuid(), 'line', v_line)), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… cards of this buy', sqlerrm, 'line_gone');
  end;
  begin
    perform buy_save_edits(b, u, a, v_ver, '[]', jsonb_build_array(jsonb_build_object('id', bolt), jsonb_build_object('id', pika)));
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and never takes every card out (Delete buy does)', sqlerrm, 'last_card');
  end;
  begin
    perform buy_save_edits(b, u, a, v_ver, jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line || '{"quantity": 0}')), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… at least one of each card', sqlerrm, 'quantity must be at least 1');
  end;
  begin
    perform buy_save_edits(gen_random_uuid(), u, a, null, jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line)), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a buy that''s still there', sqlerrm, 'buy_gone');
  end;
  perform buy_mark_completed(b, 'mtg', u, a, true);
  begin
    perform buy_save_edits(b, u, a, pg_temp.version(b), jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line)), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Completed cards can''t be edited', sqlerrm, 'buy_completed');
  end;
  perform buy_mark_completed(b, 'mtg', u, a, false);
  v_ver := pg_temp.version(b);
  perform pg_temp.ok(s, 'Nothing changed: nothing saved', buy_save_edits(b, u, a, v_ver, '[]', '[]') = v_ver);
  perform pg_temp.ok(s, '… and no Changelog entry', not exists (select 1 from events where target_id = b and action = 'buy_edited'));

  v_target := internal.buy_target_name(b);
  perform buy_save_edits(b, u, a, v_ver,
    jsonb_build_array(jsonb_build_object('id', bolt, 'line', v_line, 'old_text', '2 Dbtest Bolt (DBT) 001', 'new_text', '2 Dbtest Bolt (DBT) 001 [LP]')),
    jsonb_build_array(jsonb_build_object('id', pika, 'text', '1 Dbtestchu (DBTP) 025')));
  perform pg_temp.ok(s, 'SAVE BUY saves the edited card in place, as edited',
    (select condition = 'LP' and quantity = 2 and unit_price = 0.90 and buy_id = b from buy_lines where id = bolt));
  perform pg_temp.ok(s, '… takes the removed one out', not exists (select 1 from buy_lines where id = pika));
  perform pg_temp.ok(s, '… keeps the buy on its day and bumps its version',
    (select status = 'confirmed' and version = v_ver + 1 and last_edited_by = u from buys where id = b));
  perform pg_temp.ok(s, 'One Changelog entry, now, with each card before and after',
    exists (select 1 from events where target_id = b and action = 'buy_edited' and target_name = v_target
              and removed = 1 and summary = '1 card edited; 1 card removed.'
              and lines @> '[{"sign": "-", "text": "2 Dbtest Bolt (DBT) 001"}, {"sign": "+", "text": "2 Dbtest Bolt (DBT) 001 [LP]"}, {"sign": "-", "text": "1 Dbtestchu (DBTP) 025"}]'
              and games = array['mtg', 'pokemon']),
    (select summary || ' ' || lines::text from events where target_id = b and action = 'buy_edited'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ Flag check for condition (0053)
do $$
declare
  s text := 'Condition flag';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid;
  v_ver integer;
  v_flag boolean;
begin
  b := pg_temp.buy(a, u, 'DBTEST Flag', '5550100013', array[pg_temp.line('Dbtest Flag', 'DBT', '002', 1, 2.00)]);
  v_ver := pg_temp.version(b);
  perform pg_temp.ok(s, 'A confirmed buy starts unflagged, never checked',
    (select not condition_check and condition_checked_at is null from buys where id = b));
  v_flag := buy_set_condition_check(b, false, u, a);
  perform pg_temp.ok(s, '"Checked" on a buy never flagged changes nothing (no green chip)',
    (select not condition_check and condition_checked_at is null from buys where id = b));
  begin
    perform buy_set_condition_check(b, true, null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Flagging needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_set_condition_check(gen_random_uuid(), true, u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a confirmed buy', sqlerrm, 'buy_gone');
  end;
  -- The call first, then its effect: one statement sees the rows as they were.
  v_flag := buy_set_condition_check(b, true, u, a);
  perform pg_temp.ok(s, 'Flagged', v_flag and (select condition_check from buys where id = b));
  perform pg_temp.ok(s, '… without bumping the version (an open export stays good)', pg_temp.version(b) = v_ver);
  perform pg_temp.ok(s, '… with a Changelog entry',
    exists (select 1 from events where target_id = b and action = 'buy_flagged'
              and summary = 'Flagged: its cards need their condition checked before export.'));
  perform buy_set_condition_check(b, true, u, a);
  perform pg_temp.ok(s, 'Flagging it again logs nothing more',
    (select count(*) from events where target_id = b and action = 'buy_flagged') = 1);
  perform buy_mark_completed(b, 'mtg', u, a, true);
  v_flag := buy_set_condition_check(b, false, u, a);
  perform pg_temp.ok(s, 'Cleared (Condition checked), even once Completed',
    not v_flag and not (select condition_check from buys where id = b)
    and exists (select 1 from events where target_id = b and action = 'buy_flag_cleared'));
  perform pg_temp.ok(s, '… and remembers who checked it, and when (the green chip)',
    (select condition_checked_at is not null and condition_checked_by = u from buys where id = b));
  v_flag := buy_set_condition_check(b, true, u, a);
  perform pg_temp.ok(s, 'Flagged again: the red flag back, the check forgotten',
    (select condition_check and condition_checked_at is null and condition_checked_by is null from buys where id = b));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================================ Individual rates (0055)
do $$
declare
  s text := 'Individual rates';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  b uuid;
  c uuid;
  l_low uuid;
  l_mid uuid;
  l_high uuid;
  l_own uuid;
  l_c uuid;
  v_id uuid;
  v_ver integer;
  v jsonb;
  t jsonb;
begin
  -- The shipped tiers (master 50/65 for the run): under $3 at 25/50, over $35 at 40/70.
  update settings set value = '{"low": {"under": 3, "credit": 50, "cash": 25}, "high": {"over": 35, "credit": 70, "cash": 40}}'
   where key = 'rate_tiers';
  b := draft_for_device(a, u);
  l_low := draft_add_line(a, pg_temp.line('Dbtest Rate Low', 'DBR', '001', 2, 1.00), u, false);
  l_mid := draft_add_line(a, pg_temp.line('Dbtest Rate Mid', 'DBR', '002', 1, 3.00), u, false);
  l_high := draft_add_line(a, pg_temp.line('Dbtest Rate High', 'DBR', '003', 1, 40.00), u, false);
  l_own := draft_add_line(a, pg_temp.line('Dbtest Rate Own', 'DBR', '004', 1, 10.00), u, false);
  perform pg_temp.ok(s, 'A $1 card is on the low-end rates',
    (select internal.line_pct(l, x, 'cash') = 25 and internal.line_pct(l, x, 'credit') = 50
       from buy_lines l, buys x where l.id = l_low and x.id = b));
  perform pg_temp.ok(s, '… a $3 card isn''t: strictly under (the master rates)',
    (select internal.line_pct(l, x, 'cash') = 50 and internal.line_pct(l, x, 'credit') = 65
       from buy_lines l, buys x where l.id = l_mid and x.id = b));
  perform pg_temp.ok(s, 'A $40 card is on the high-end rates',
    (select internal.line_pct(l, x, 'cash') = 40 and internal.line_pct(l, x, 'credit') = 70
       from buy_lines l, buys x where l.id = l_high and x.id = b));

  begin
    perform draft_set_line_rate(l_own, 101, null, u);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Set Rate: 0 to 100', sqlerrm, 'bad_pct');
  end;
  begin
    perform draft_set_line_rate(l_own, null, 12.345, u);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with up to 2 decimals', sqlerrm, 'bad_pct');
  end;
  v_ver := pg_temp.version(b);
  perform draft_set_line_rate(l_own, null, 80, u);
  perform pg_temp.ok(s, 'Set Rate keeps a card''s own Credit rate',
    (select custom_credit_pct = 80 and custom_cash_pct is null from buy_lines where id = l_own)
    and pg_temp.version(b) > v_ver);
  perform pg_temp.ok(s, '… and its Cash comes from the next step down',
    (select internal.line_pct(l, x, 'cash') = 50 and internal.line_pct(l, x, 'credit') = 80
       from buy_lines l, buys x where l.id = l_own and x.id = b));
  -- The same card merges, own rate or not (0056; owner, 2026-10-15).
  v_id := draft_add_line(a, pg_temp.line('Dbtest Rate Own', 'DBR', '004', 1, 10.00), u, true);
  perform pg_temp.ok(s, 'The same card added again merges, the copy taking its own rate',
    v_id = l_own and (select quantity = 2 and custom_credit_pct = 80 from buy_lines where id = l_own));
  v_id := draft_add_line(a, pg_temp.line('Dbtest Rate Own', 'DBR', '004', 1, 10.00, p_cond => 'LP'), u, true);
  v_id := draft_update_line(v_id, pg_temp.line('Dbtest Rate Own', 'DBR', '004', 1, 10.00), u);
  perform pg_temp.ok(s, 'A card edited into a copy of one with its own rate merges, keeping it',
    v_id = l_own and (select quantity = 3 and custom_credit_pct = 80 from buy_lines where id = l_own));
  perform draft_remove_line(l_own, 2, u);
  perform draft_set_custom_rates(a, 45, null, u);
  perform pg_temp.ok(s, 'Custom rates on the buy turn the low/high rules off',
    (select internal.line_pct(l, x, 'cash') = 45 and internal.line_pct(l, x, 'credit') = 65
       from buy_lines l, buys x where l.id = l_low and x.id = b));
  perform pg_temp.ok(s, '… but not a card''s own rate',
    (select internal.line_pct(l, x, 'credit') = 80 from buy_lines l, buys x where l.id = l_own and x.id = b));

  -- Confirmed with its custom rates (45 cash) and a card's own (80 credit) still set; the
  -- app sending the master rates, as before 0061.
  perform confirm_buy(b, u, 'DBTEST Rates', '', 50, 65, null, 20, 'cash', '{}', '5550100021');
  perform pg_temp.ok(s, 'CONFIRM BUY keeps the rates it was priced at: custom and own (0061)',
    (select cash_pct = 45 and credit_pct = 65 and custom_cash_pct = 45 and custom_credit_pct is null
       from buys where id = b)
    and (select custom_credit_pct = 80 from buy_lines where id = l_own));
  perform pg_temp.ok(s, '… each card''s rate as priced kept on it (custom rates: no low/high end)',
    (select bool_and(case id when l_low then cash_pct = 45 and credit_pct = 65
                             when l_mid then cash_pct = 45 and credit_pct = 65
                             when l_high then cash_pct = 45 and credit_pct = 65
                             when l_own then cash_pct = 45 and credit_pct = 80 end)
       from buy_lines where buy_id = b));
  -- $2 + $3 + $40 + $10 = $55; Cash 45% = 24.75 → $24; Credit 65% of 45 + 80% of 10 = 37.25 → $37.
  select totals into t from events where action = 'buy_confirmed' and target_id = b;
  perform pg_temp.ok(s, 'The Changelog''s totals: each card at its rate, rounded down once',
    (t ->> 'market')::numeric = 55 and (t ->> 'cash')::numeric = 24 and (t ->> 'credit')::numeric = 37
    and (t ->> 'cash_pct')::numeric = 45 and (t ->> 'credit_pct')::numeric = 65, t::text);
  update settings set value = '{"low": {"under": 50, "credit": 10, "cash": 5}, "high": {"over": 35, "credit": 70, "cash": 40}}'
   where key = 'rate_tiers';
  update settings set value = '20' where key = 'cash_pct';
  perform pg_temp.ok(s, 'Changing the settings later changes nothing on a confirmed buy',
    (select (internal.lines_totals(x, array(select l from buy_lines l where l.buy_id = x.id)) ->> 'cash')::numeric = 24
       from buys x where x.id = b));
  update settings set value = '50' where key = 'cash_pct';
  update settings set value = '{"low": {"under": 3, "credit": 50, "cash": 25}, "high": {"over": 35, "credit": 70, "cash": 40}}'
   where key = 'rate_tiers';
  begin
    perform draft_set_line_rate(l_low, 30, 30, u);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Set Rate only on a draft''s card', sqlerrm, 'line_gone');
  end;
  perform buy_remove_line(l_low, 1, u, a, null, null);
  perform pg_temp.ok(s, 'Cards removed from a buy: their totals at the card''s rate',
    exists (select 1 from events where action = 'buy_cards_removed' and target_id = b
              and (totals ->> 'market')::numeric = 1 and (totals ->> 'cash')::numeric = 0.45
              and (totals ->> 'credit')::numeric = 0.65));

  -- A collection.
  c := collection_create('DBTEST Rate Collection', null, '', u, a);
  v := lock_acquire(c, a, u);
  l_c := collection_add_line(c, pg_temp.line('Dbtest Rate Coll', 'DBR', '010', 2, 50.00), false, u, a, null, null);
  perform pg_temp.ok(s, 'Cards added: the Changelog''s row carries their rates (a folded run''s totals)',
    exists (select 1 from events where action = 'collection_cards_added' and target_id = c
              and lines -> 0 ->> 'cash_pct' = '40' and lines -> 0 ->> 'credit_pct' = '70'
              and (totals ->> 'cash')::numeric = 40));
  begin
    perform collection_set_line_rate(l_c, 45, null, null, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Set Rate on a collection''s card needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform collection_set_line_rate(l_c, 45, null, u, bd, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the lock', sqlerrm, 'not_lock_holder');
  end;
  begin
    perform collection_set_line_rate(l_c, 45, null, u, a, pg_temp.version(c) - 1, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and the version it saw', sqlerrm, 'stale_version');
  end;
  perform collection_set_line_rate(l_c, 45, null, u, a, pg_temp.version(c), '2 Dbtest Rate Coll');
  perform pg_temp.ok(s, 'Set Rate on a collection''s card',
    (select custom_cash_pct = 45 and custom_credit_pct is null from buy_lines where id = l_c));
  perform pg_temp.ok(s, '… logged with what the rate was',
    exists (select 1 from events where action = 'collection_line_rate' and target_id = c
              and summary = 'Own rate set: 2 Dbtest Rate Coll.'
              and fields = '[{"field": "cash %", "before": "40", "after": "45"}]'::jsonb));
  perform collection_set_status(c, 'paid', u, a, 50, 65, null, p_paid_price => 30, p_paid_method => 'cash');
  perform pg_temp.ok(s, 'Paid/Ours keeps each card''s rates on it',
    (select cash_pct = 45 and credit_pct = 70 from buy_lines where id = l_c));
  begin
    perform collection_set_line_rate(l_c, null, null, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'No Set Rate on a Paid/Ours collection', sqlerrm, 'collection_paid');
  end;
  perform collection_set_status(c, 'processing', u, a, null, null, null);
  perform pg_temp.ok(s, 'Unlocked again: worked out live, its own rate kept',
    (select cash_pct is null and credit_pct is null and custom_cash_pct = 45 from buy_lines where id = l_c));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- =========================================================== Bulk (0058)
do $$
declare
  s text := 'Bulk';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid;
  l_card uuid;
  l_bulk uuid;
  v_id uuid;
begin
  b := draft_for_device(a, u);
  l_card := draft_add_line(a, pg_temp.line('Dbtest Bulk Card', 'DBK', '001', 1, 5.00), u, true);
  l_bulk := draft_add_line(a, pg_temp.bulk('mtg_100_common', 10, 1.50), u, true);
  perform pg_temp.ok(s, 'Bulk is a line of its own, marked as bulk',
    (select bulk_kind = 'mtg_100_common' and set_code = 'BULK' and price_source = 'bulk' and quantity = 10
       from buy_lines where id = l_bulk));
  v_id := draft_add_line(a, pg_temp.bulk('mtg_100_common', 5, 1.50), u, true);
  perform pg_temp.ok(s, 'The same item again adds to its line',
    v_id = l_bulk and (select quantity from buy_lines where id = l_bulk) = 15);
  v_id := draft_add_line(a, pg_temp.bulk('mtg_10_fifty', 1, 1.50), u, true);
  perform pg_temp.ok(s, '… another item at the same value is a line of its own', v_id <> l_bulk);
  perform draft_remove_line(v_id, 1, u);
  begin
    perform draft_add_line(a, pg_temp.line('Dbtest Not Bulk', 'DBK', '002', 1, 1.00) || '{"price_source": "bulk"}', u, false);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Only bulk is priced as bulk', sqlstate = '23514', sqlerrm);
  end;
  begin
    perform draft_add_line(a, pg_temp.bulk('mtg_100_rare', 1, 2.40) || '{"set_code": "DBK"}', u, false);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, '… and bulk keeps its placeholders', sqlstate = '23514', sqlerrm);
  end;
  -- $1.50 is under the low end ($3): a card would get 25 / 50.
  perform pg_temp.ok(s, 'Bulk never takes the low-end or high-end rates',
    (select internal.line_pct(l, x, 'cash') = 50 and internal.line_pct(l, x, 'credit') = 65
       from buy_lines l, buys x where l.id = l_bulk and x.id = b));

  perform confirm_buy(b, u, 'DBTEST Bulk', '', 50, 65, null, 10, 'cash', '{}', '5550100022');
  perform buy_mark_completed(b, 'mtg', u, a, true);
  perform pg_temp.ok(s, 'Mark as completed leaves bulk out',
    (select completed_at is null from buy_lines where id = l_bulk)
    and (select completed_at is not null from buy_lines where id = l_card));
  perform pg_temp.ok(s, '… and the buy is Completed: all its real cards are',
    (select 'mtg' = any(completed_games) from buys_in_range(now() - interval '1 hour', now() + interval '1 hour') r
      where r.id = b));
  perform pg_temp.ok(s, 'The header search doesn''t find bulk',
    not exists (select 1 from global_search('DBTEST mtg_100', null, null, null, true) g where g.line_id = l_bulk));

  -- 0066: the Changelog counts bulk apart, as CONFIRM BUY's dialog does.
  perform pg_temp.ok(s, 'Its Changelog entry: "1 card + 1,500 bulk bought…", added counting the card only',
    exists (select 1 from events where action = 'buy_confirmed' and target_id = b and added = 1
              and summary = '1 card + 1,500 bulk bought from DBTEST Bulk, (555) 010-0022; paid $10 in cash.'),
    (select summary || ' added ' || added from events where action = 'buy_confirmed' and target_id = b));
  -- A Completed side is locked, its bulk too (0084): back to Paid/Ours to strike and remove it.
  begin
    perform buy_strike_line(l_bulk, 5, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Completed side''s bulk is locked too (0084)', sqlerrm, 'buy_completed');
  end;
  perform buy_mark_completed(b, 'mtg', u, a, false);
  perform buy_strike_line(l_bulk, 5, u, a, null, null);
  perform pg_temp.ok(s, 'Struck bulk: "500 bulk struck…"',
    exists (select 1 from events where action = 'buy_cards_struck' and target_id = b
              and summary = '500 bulk struck: kept on the buy, crossed out, and never exported.'),
    (select summary from events where action = 'buy_cards_struck' and target_id = b));
  perform buy_remove_line(l_bulk, 1, u, a, null, null);
  perform pg_temp.ok(s, 'Removed bulk: "100 bulk removed…", removing no cards',
    exists (select 1 from events where action = 'buy_cards_removed' and target_id = b and removed = 0
              and summary = '100 bulk removed from a confirmed buy.'),
    (select summary || ' removed ' || removed from events where action = 'buy_cards_removed' and target_id = b));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ====================================================== Placeholders (0062)
do $$
declare
  s text := 'Placeholders';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid;
  l1 uuid;
  l2 uuid;
  v_id uuid;
begin
  b := draft_for_device(a, u);
  l1 := draft_add_line(a, pg_temp.bulk('pkm_placeholder', 1, 1.00)
    || '{"name": "DBTEST Meowth 117", "name_key": "dbtest meowth 117", "price_source": "manual"}', u, true);
  perform pg_temp.ok(s, 'A placeholder is a line of its own, by the name typed',
    (select bulk_kind = 'pkm_placeholder' and name = 'DBTEST Meowth 117' and price_source = 'manual' and set_code = 'BULK'
       from buy_lines where id = l1));
  v_id := draft_add_line(a, pg_temp.bulk('pkm_placeholder', 2, 1.00)
    || '{"name": "DBTEST Meowth 117", "name_key": "dbtest meowth 117", "price_source": "manual"}', u, true);
  perform pg_temp.ok(s, 'The same name and price add to its line',
    v_id = l1 and (select quantity from buy_lines where id = l1) = 3);
  l2 := draft_add_line(a, pg_temp.bulk('pkm_placeholder', 1, 1.00)
    || '{"name": "DBTEST Vulpix 37", "name_key": "dbtest vulpix 37", "price_source": "manual"}', u, true);
  perform pg_temp.ok(s, '… another name is a line of its own', l2 <> l1);
  begin
    perform draft_add_line(a, pg_temp.bulk('mtg_placeholder', 1, 5.00), u, false);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'A placeholder''s price is always typed in', sqlstate = '23514', sqlerrm);
  end;
  -- $1 is under the low end ($3): 25 / 50, as a card at $1 (bulk gets the master rates).
  perform pg_temp.ok(s, 'A placeholder takes the low-end / high-end rates by its price, like a card',
    (select internal.line_pct(l, x, 'cash') = 25 and internal.line_pct(l, x, 'credit') = 50
       from buy_lines l, buys x where l.id = l1 and x.id = b));

  perform confirm_buy(b, u, 'DBTEST Placeholder', '', 50, 65, null, 1, 'cash', '{}', '5550100025');
  perform pg_temp.ok(s, 'Its Changelog entry counts placeholders as cards (0066)',
    exists (select 1 from events where action = 'buy_confirmed' and target_id = b and added = 4
              and summary = '4 cards bought from DBTEST Placeholder, (555) 010-0025; paid $1 in cash.'),
    (select summary || ' added ' || added from events where action = 'buy_confirmed' and target_id = b));
  perform pg_temp.ok(s, 'The header search finds a placeholder by its name',
    exists (select 1 from global_search('dbtest meowth', null, null, null, false) g where g.line_id = l1));
  -- 0063: and says it's one (bulk_kind), so the app needn't guess from the set code.
  perform pg_temp.ok(s, 'The header search says it is a placeholder',
    (select g.bulk_kind = 'pkm_placeholder' from global_search('dbtest meowth', null, null, null, false) g where g.line_id = l1));
  perform buy_mark_completed(b, 'pokemon', u, a, true);
  perform pg_temp.ok(s, 'Mark as completed leaves it out, as bulk',
    (select completed_at is null from buy_lines where id = l1));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================================== Struck cards (0059)
do $$
declare
  s text := 'Struck cards';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  b uuid;
  c uuid;
  p uuid;
  l_a uuid;
  l_b uuid;
  l_x uuid;
  l_c uuid;
  v_id uuid;
  v_id2 uuid;
  v_before jsonb;
  v jsonb;
begin
  b := pg_temp.buy(a, u, 'DBTEST Struck', '5550100023', array[
    pg_temp.line('Dbtest Struck A', 'DST', '001', 3, 5.00),
    pg_temp.line('Dbtest Struck B', 'DST', '002', 1, 10.00)]);
  l_a := pg_temp.line_id(b, 'Dbtest Struck A');
  l_b := pg_temp.line_id(b, 'Dbtest Struck B');
  select internal.lines_totals(x, array(select l from buy_lines l where l.buy_id = x.id)) into v_before
    from buys x where x.id = b;

  begin
    perform buy_strike_line(l_a, 1, null, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Striking a card needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_strike_line(l_a, 1, u, a, pg_temp.version(b) - 1, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and the version it saw', sqlerrm, 'stale_version');
  end;
  v_id := buy_strike_line(l_a, 1, u, a, pg_temp.version(b), '1 Dbtest Struck A');
  perform pg_temp.ok(s, 'Striking some copies splits them off, struck, just below the card',
    v_id <> l_a
    and (select quantity = 2 and struck_at is null from buy_lines where id = l_a)
    and (select quantity = 1 and struck_at is not null and struck_by = u
                and position = (select position + 1 from buy_lines where id = l_a)
           from buy_lines where id = v_id)
    and (select position from buy_lines where id = l_b) > (select position from buy_lines where id = v_id));
  perform pg_temp.ok(s, '… logged, at the card''s rate',
    exists (select 1 from events where action = 'buy_cards_struck' and target_id = b
              and lines -> 0 ->> 'struck' = 'true' and lines -> 0 ->> 'text' = '1 Dbtest Struck A'
              and (totals ->> 'market')::numeric = 5));
  v_id2 := buy_strike_line(l_a, 1, u, a, null, null);
  perform pg_temp.ok(s, 'Striking another copy adds it to the struck line',
    v_id2 = v_id and (select quantity from buy_lines where id = v_id) = 2
    and (select quantity from buy_lines where id = l_a) = 1);
  perform pg_temp.ok(s, 'Struck cards still count in the totals',
    (select internal.lines_totals(x, array(select l from buy_lines l where l.buy_id = x.id)) from buys x where x.id = b)
      = v_before);
  begin
    perform buy_strike_line(v_id, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A struck card can''t be struck again', sqlerrm, 'line_struck');
  end;
  begin
    perform buy_restore_line(l_a, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only a struck card is restored', sqlerrm, 'line_not_struck');
  end;
  v_id2 := buy_restore_line(v_id, u, a, pg_temp.version(b), '2 Dbtest Struck A');
  perform pg_temp.ok(s, 'Restore puts the copies back on the card',
    v_id2 = l_a and (select quantity from buy_lines where id = l_a) = 3
    and not exists (select 1 from buy_lines where id = v_id));
  perform pg_temp.ok(s, '… logged',
    exists (select 1 from events where action = 'buy_cards_restored' and target_id = b
              and lines -> 0 ->> 'restored' = 'true' and summary = '2 struck cards restored.'));

  v_id := buy_strike_line(l_b, 5, u, a, null, null);
  perform pg_temp.ok(s, 'Striking every copy strikes the card in place',
    v_id = l_b and (select quantity = 1 and struck_at is not null from buy_lines where id = l_b));
  perform pg_temp.ok(s, 'The header search leaves a struck card out unless asked',
    not exists (select 1 from global_search('dbtest struck b', null, null, null, true) g where g.line_id = l_b)
    and exists (select 1 from global_search('dbtest struck a', null, null, null, true) g
                 where g.line_id = l_a and g.struck_at is null));
  -- 0067: Show all asks for struck cards too, and they come marked.
  perform pg_temp.ok(s, '… and Show all finds it, struck, by whom, not Completed while its game isn''t',
    exists (select 1 from global_search('dbtest struck b', null, null, null, true, true) g
             where g.line_id = l_b and g.struck_at is not null and g.struck_by = u and not g.completed));
  perform buy_mark_completed(b, 'mtg', u, a, true);
  perform pg_temp.ok(s, 'A struck card found with Show all reads Completed once the rest of its game is',
    exists (select 1 from global_search('dbtest struck b', null, null, null, true, true) g
             where g.line_id = l_b and g.completed));
  perform pg_temp.ok(s, 'Mark as completed leaves a struck card out',
    (select completed_at is null from buy_lines where id = l_b)
    and (select completed_at is not null from buy_lines where id = l_a));
  perform pg_temp.ok(s, '… and the buy is Completed: all its other cards are',
    (select 'mtg' = any(completed_games) from buys_in_range(now() - interval '1 hour', now() + interval '1 hour') r
      where r.id = b));
  begin
    perform buy_strike_line(l_a, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Completed card can''t be struck', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_remove_line(l_b, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor its struck card removed while its game is Completed (0084)', sqlerrm, 'buy_completed');
  end;
  perform buy_mark_completed(b, 'mtg', u, a, false);
  perform buy_remove_line(l_b, 1, u, a, null, null);
  perform pg_temp.ok(s, 'A second × removes the struck card',
    not exists (select 1 from buy_lines where id = l_b));

  -- Edit in project view: strikes and restores saved with SAVE BUY.
  perform buy_save_edits(b, u, a, pg_temp.version(b),
    jsonb_build_array(jsonb_build_object('id', l_a,
      'line', (select to_jsonb(l) from buy_lines l where l.id = l_a) || '{"condition": "LP"}'::jsonb)),
    '[]', jsonb_build_array(jsonb_build_object('id', l_a, 'qty', 1, 'text', '1 Dbtest Struck A [LP]')), '[]');
  select id into v_id from buy_lines where buy_id = b and struck_at is not null;
  perform pg_temp.ok(s, 'SAVE BUY strikes copies of the card as edited',
    (select quantity = 2 and condition = 'LP' and struck_at is null from buy_lines where id = l_a)
    and (select quantity = 1 and condition = 'LP' from buy_lines where id = v_id));
  perform buy_save_edits(b, u, a, pg_temp.version(b), '[]', '[]', '[]',
    jsonb_build_array(jsonb_build_object('id', v_id, 'text', '1 Dbtest Struck A [LP]')));
  perform pg_temp.ok(s, '… and restores them',
    (select quantity from buy_lines where id = l_a) = 3 and not exists (select 1 from buy_lines where id = v_id)
    and exists (select 1 from events where action = 'buy_edited' and target_id = b
                  and summary = '1 struck card restored.'));

  -- A collection: Paid/Ours only.
  c := collection_create('DBTEST Struck Collection', null, '', u, a);
  v := lock_acquire(c, a, u);
  l_c := collection_add_line(c, pg_temp.line('Dbtest Struck Coll', 'DST', '010', 2, 4.00), false, u, a, null, null);
  begin
    perform collection_strike_line(l_c, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.err(s, 'A Processing collection''s card isn''t struck: × removes it', sqlerrm, 'strike_paid_only');
  end;
  perform collection_set_status(c, 'paid', u, a, 50, 65, null, p_paid_price => 3, p_paid_method => 'cash');
  begin
    perform collection_strike_line(l_c, 1, u, bd, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Striking a collection''s card needs the lock', sqlerrm, 'not_lock_holder');
  end;
  v_id := collection_strike_line(l_c, 1, u, a, pg_temp.version(c), '1 Dbtest Struck Coll');
  perform pg_temp.ok(s, 'A Paid/Ours collection''s card is struck, its rates kept',
    (select quantity = 1 and struck_at is not null and cash_pct = 50 and credit_pct = 65 from buy_lines where id = v_id)
    and exists (select 1 from events where action = 'collection_cards_struck' and target_id = c
                  and (lines -> 0 ->> 'cash_pct')::numeric = 50));
  perform collection_set_status(c, 'processing', u, a, null, null, null);
  begin
    perform collection_update_line(v_id, (select to_jsonb(l) from buy_lines l where l.id = v_id), u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A struck card can''t be edited', sqlerrm, 'line_struck');
  end;
  begin
    perform collection_set_line_rate(v_id, 40, 60, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or given a rate', sqlerrm, 'line_struck');
  end;
  v_id2 := collection_add_line(c, pg_temp.line('Dbtest Struck Coll', 'DST', '010', 1, 4.00), true, u, a, null, null);
  perform pg_temp.ok(s, 'The same card added merges with the live card, never the struck one',
    v_id2 = l_c and (select quantity from buy_lines where id = l_c) = 2
    and (select quantity from buy_lines where id = v_id) = 1);
  v_id2 := collection_restore_line(v_id, u, a, pg_temp.version(c), '1 Dbtest Struck Coll');
  perform pg_temp.ok(s, 'Restore works wherever cards can be removed',
    (select struck_at is null from buy_lines where id = v_id2)
    and exists (select 1 from events where action = 'collection_cards_restored' and target_id = c));

  -- A project doesn't strike: its × removes (owner, 2026-10-16; 0060).
  p := project_create('DBTEST Struck Project', '', u, a);
  v := lock_acquire(p, a, u);
  l_x := collection_add_line(p, pg_temp.line('Dbtest Struck Proj', 'DST', '020', 1, 2.00), false, u, a, null, null);
  begin
    perform collection_strike_line(l_x, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.err(s, 'A project''s card isn''t struck: × removes it', sqlerrm, 'project_no_strike');
  end;
  -- Convert to project leaves a buy's struck cards out, crossed out in its entry.
  b := pg_temp.buy(a, u, 'DBTEST Struck Convert', '5550100024', array[
    pg_temp.line('Dbtest Struck C', 'DST', '030', 2, 3.00),
    pg_temp.line('Dbtest Struck D', 'DST', '031', 1, 4.00)]);
  perform buy_strike_line(pg_temp.line_id(b, 'Dbtest Struck D'), 1, u, a, null, null);
  p := buy_to_project(b, 'DBTEST Struck Convert', u, a);
  perform pg_temp.ok(s, 'Convert to project leaves struck cards out',
    (select count(*) = 1 and sum(quantity) = 2 from buy_lines where buy_id = p)
    and not exists (select 1 from buy_lines where buy_id = p and struck_at is not null));
  perform pg_temp.ok(s, '… listed crossed out in its Changelog entry',
    exists (select 1 from events where action = 'buy_converted' and target_id = p
              and lines @> '[{"struck": true, "qty": 1}]'::jsonb
              and summary like '%; 1 struck card left out.'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ Convert to collection (0076)
do $$
declare
  s text := 'Convert to collection';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  v_b uuid;
  v_c uuid;
begin
  -- A buy with custom rates, two cards, one struck.
  v_b := draft_for_device(a, u);
  perform draft_set_custom_rates(a, 40, 60, u);
  perform draft_add_line(a, pg_temp.line('Dbtest Coll A', 'DBT', '041', 2, 1.00), u, true);
  perform draft_add_line(a, pg_temp.line('Dbtest Coll B', 'DBT', '042', 1, 4.00), u, true);
  perform confirm_buy(v_b, u, 'DBTEST Erika', '', 50, 65, null, 3, 'credit', '{}', '5550100031');
  perform buy_strike_line(pg_temp.line_id(v_b, 'Dbtest Coll B'), 1, u, a, null, null);

  begin
    perform buy_to_collection(v_b, null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Convert to collection needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_to_collection(v_b, u, a, pg_temp.version(v_b) + 1);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and the buy as it is now', sqlerrm, 'stale_version');
  end;
  v_c := buy_to_collection(v_b, u, a, pg_temp.version(v_b), '{}');
  perform pg_temp.ok(s, 'Convert to collection makes a Paid/Ours collection: the buy''s name and phone, ID 1312, what was paid',
    (select kind = 'collection' and status = 'paid' and not project and customer_name = 'DBTEST Erika'
            and phone = '5550100031' and id_last4 = '1312' and paid_price = 3 and paid_method = 'credit'
            and created_by = u from buys where id = v_c));
  perform pg_temp.ok(s, '… keeping the buy''s rates, on the collection and its cards',
    (select cash_pct = 40 and credit_pct = 60 and custom_cash_pct = 40 from buys where id = v_c)
    and not exists (select 1 from buy_lines where buy_id = v_c and (cash_pct is null or credit_pct is null)));
  perform pg_temp.ok(s, 'Its live card moved, the struck one left out; the buy is gone',
    (select count(*) = 1 and sum(quantity) = 2 from buy_lines where buy_id = v_c)
    and not exists (select 1 from buys where id = v_b));
  perform pg_temp.ok(s, 'One Changelog entry: Collection started from Buy N, the struck card crossed out',
    exists (select 1 from events where action = 'buy_converted_collection' and target_id = v_c and added = 2
              and lines @> '[{"struck": true, "qty": 1}]'::jsonb
              and summary like 'Collection started from Buy % · %: DBTEST Erika; 1 struck card left out.'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ Convert to project, and back
do $$
declare
  s text := 'Convert';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  v_b uuid;
  v_p uuid;
  v_e uuid;
  v_r uuid;
  v_l uuid;
  v_nb uuid;
  v_ver integer;
  v_res jsonb;
begin
  -- A buy with custom rates.
  v_b := draft_for_device(a, u);
  perform draft_set_custom_rates(a, 40, 60, u);
  perform draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00), u, true);
  perform draft_add_line(a, pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon'), u, true);
  perform confirm_buy(v_b, u, 'DBTEST Brock', '', 50, 65, null, 3, 'cash', '{}', '5550100003');
  perform pg_temp.ok(s, 'Confirmed, a buy keeps its custom rates (0061)',
    (select cash_pct = 40 and credit_pct = 60 and custom_cash_pct = 40 from buys where id = v_b));

  begin
    perform buy_to_project(v_b, '   ', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Convert to project needs a name', sqlerrm, 'bad_name');
  end;
  begin
    perform buy_to_project(v_b, repeat('x', 81), u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… of 80 characters at most', sqlerrm, 'bad_name');
  end;
  begin
    perform buy_to_project(v_b, 'DBTEST X', null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a user', sqlerrm, 'no_user');
  end;
  begin
    perform buy_to_project(v_b, 'DBTEST X', u, a, pg_temp.version(v_b) + 1);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and the buy as it is now', sqlerrm, 'stale_version');
  end;
  v_p := buy_to_project(v_b, '  DBTEST   Project  ', u, a, pg_temp.version(v_b), '{}');
  perform pg_temp.ok(s, 'Convert to project makes a Paid/Ours project, keeping what was paid',
    (select kind = 'collection' and status = 'paid' and project and customer_name = 'DBTEST Project'
            and phone = '5550100003' and paid_price = 3 and paid_method = 'cash' and cash_pct is null
            and credit_pct is null and created_by = u from buys where id = v_p));
  perform pg_temp.ok(s, '… with no rates, nor its cards (a project is the store''s own cards)',
    not exists (select 1 from buy_lines where buy_id = v_p
                  and (cash_pct is not null or credit_pct is not null or custom_cash_pct is not null)));
  perform pg_temp.ok(s, 'Its cards moved; the buy is gone',
    (select count(*) from buy_lines where buy_id = v_p) = 2 and not exists (select 1 from buys where id = v_b));
  perform pg_temp.ok(s, 'One Changelog entry: Project started from Buy N',
    exists (select 1 from events where action = 'buy_converted' and target_id = v_p and added = 3
              and summary like 'Project started from Buy % · %: DBTEST Project.'));
  perform pg_temp.ok(s, 'A project isn''t a past customer',
    not exists (select 1 from customers where name_key = 'dbtest project'));

  v_ver := pg_temp.version(v_p);
  begin
    perform project_to_buy(v_p, null, a, 'DBTEST Gary', '5550100004', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Convert to buy needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform project_to_buy(v_p, u, a, '  ', '5550100004', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a name', sqlerrm, 'name_needed');
  end;
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a phone number', sqlerrm, 'phone_needed');
  end;
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '555', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a whole phone number', sqlerrm, 'bad_phone');
  end;
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '5550100004', -1, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the price paid', sqlerrm, 'paid_price_needed');
  end;
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '5550100004', 2, null, '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… cash or credit', sqlerrm, 'paid_method_needed');
  end;
  begin
    perform project_to_buy(gen_random_uuid(), u, a, 'DBTEST Gary', '5550100004', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a project that''s still there', sqlerrm, 'collection_gone');
  end;
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '5550100004', 2, 'credit', '', 50, 65, v_ver + 1);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… the project as it is now', sqlerrm, 'stale_version');
  end;
  perform lock_acquire(v_p, bd, u, false);
  begin
    perform project_to_buy(v_p, u, a, 'DBTEST Gary', '5550100004', 2, 'credit', '', 50, 65, v_ver);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nobody else editing it', sqlerrm, 'locked_elsewhere');
  end;
  perform lock_release(v_p, bd);
  v_e := project_create('DBTEST Empty Project', '', u, a);
  begin
    perform project_to_buy(v_e, u, a, 'DBTEST Gary', '5550100004', 2, 'credit', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a card', sqlerrm, 'empty_buy');
  end;

  v_res := project_to_buy(v_p, u, a, '  DBTEST   Gary ', '+1 555 010 0004', 2.5, 'credit', ' back ', 50, 65,
                          pg_temp.version(v_p), '{}');
  v_nb := (v_res ->> 'id')::uuid;
  perform pg_temp.ok(s, 'Convert to buy makes a confirmed buy today, as entered',
    (select kind = 'walk_in' and status = 'confirmed' and customer_name = 'DBTEST Gary' and phone = '5550100004'
            and paid_price = 2.5 and paid_method = 'credit' and notes = 'back' and cash_pct = 50 and credit_pct = 65
            and confirmed_by = u and custom_cash_pct is null from buys where id = v_nb));
  perform pg_temp.ok(s, 'It takes the cards; the project is gone',
    (select count(*) from buy_lines where buy_id = v_nb) = 2 and not exists (select 1 from buys where id = v_p));
  perform pg_temp.ok(s, 'It answers with its number and day',
    v_res ->> 'day' = to_char((now() at time zone 'America/Los_Angeles')::date, 'YYYY-MM-DD')
    and (v_res ->> 'number')::integer >= 1 and v_res -> 'games' = '["mtg", "pokemon"]'::jsonb
    and v_res ->> 'target_name' like 'Buy % · %', v_res::text);
  perform pg_temp.ok(s, 'The Changelog says it came from the project',
    exists (select 1 from events where action = 'project_converted' and target_id = v_nb and added = 3
              and summary = '3 cards from the project DBTEST Project, bought from DBTEST Gary, (555) 010-0004; paid $2.50 in credit.'),
    (select summary from events where action = 'project_converted' and target_id = v_nb));
  perform pg_temp.ok(s, 'The customer is remembered',
    exists (select 1 from customers where name_key = 'dbtest gary' and phone = '5550100004'));

  -- A project has no rates (0057; owner, 2026-10-15).
  v_r := project_create('DBTEST Rates', '', u, a);
  perform lock_acquire(v_r, a, u);
  v_l := collection_add_line(v_r, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
  begin
    perform collection_update_info(v_r, '{"custom_cash_pct": 45, "custom_credit_pct": 55}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A project takes no custom rates', sqlerrm, 'project_rates');
  end;
  begin
    perform collection_set_line_rate(v_l, 45, null, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor Set Rate on its cards', sqlerrm, 'project_rates');
  end;
  v_res := project_to_buy(v_r, u, a, 'DBTEST Gary', '5550100004', 1, 'cash', '', 50, 65);
  perform pg_temp.ok(s, 'Converted, it''s a buy on the default rates (its own lock is no bar)',
    (select cash_pct = 50 and credit_pct = 65 and custom_cash_pct is null and custom_credit_pct is null
       from buys where id = (v_res ->> 'id')::uuid)
    and (select cash_pct = 25 and credit_pct = 50 from buy_lines where id = v_l));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================================ Collections
do $$
declare
  s text := 'Collections';
  u uuid := pg_temp.id('u1');
  u2 uuid := pg_temp.id('u2');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  v_c uuid;
  v_c0 uuid;
  v_i uuid;
  v_pi uuid;
  c1 uuid;
  c2 uuid;
  cp uuid;
  v_id uuid;
  v jsonb;
  v_n integer;
  v_ver integer;
begin
  begin
    perform collection_create('DBTEST X', null, '', null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '+ Price Collection needs a user', sqlerrm, 'no_user');
  end;
  begin
    perform collection_create('  ', null, '', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a name', sqlerrm, 'bad_name');
  end;
  begin
    perform collection_create(repeat('x', 81), null, '', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… of 80 characters at most', sqlerrm, 'bad_name');
  end;
  begin
    perform collection_create('DBTEST X', '555', '', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a whole phone number when one''s given', sqlerrm, 'bad_phone');
  end;
  begin
    perform collection_create('DBTEST X', null, '', u, a, '12345');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a last 4 ID of 4 at most', sqlerrm, 'bad_last4');
  end;
  begin
    perform collection_create('DBTEST X', null, '', u, a, 'A-1');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… of letters and digits', sqlerrm, 'bad_last4');
  end;
  v_c := collection_create('  DBTEST   Collection ', '5550100005', ' a note ', u, a, 'ab12');
  perform pg_temp.ok(s, 'A collection starts Processing, as entered',
    (select status = 'processing' and not project and customer_name = 'DBTEST Collection' and phone = '5550100005'
            and id_last4 = 'AB12' and notes = 'a note' and created_by = u from buys where id = v_c));
  perform pg_temp.ok(s, 'The Changelog lists its details',
    exists (select 1 from events where action = 'collection_created' and target_id = v_c
              and summary = 'Collection created for DBTEST Collection.' and jsonb_array_length(fields) = 4
              and fields -> 1 ->> 'after' = '(555) 010-0005'));
  perform pg_temp.ok(s, 'Its customer is remembered',
    exists (select 1 from customers where name_key = 'dbtest collection' and phone = '5550100005'));
  v_c0 := collection_create('DBTEST No Phone', null, '', u, a);
  perform pg_temp.ok(s, 'No phone is allowed', (select phone is null from buys where id = v_c0));

  -- The lock.
  v := lock_acquire(v_c, a, u);
  perform pg_temp.ok(s, 'A computer takes the lock', (v ->> 'held')::boolean);
  v := lock_acquire(v_c, bd, u2);
  perform pg_temp.ok(s, 'Another computer sees who has it',
    not (v ->> 'held')::boolean and v ->> 'device_label' = 'DBTEST Computer A' and (v ->> 'staff_user_id')::uuid = u);
  perform pg_temp.ok(s, 'A heartbeat without the lock fails; with it, works',
    not lock_heartbeat(v_c, bd, u2) and lock_heartbeat(v_c, a, u));
  update collection_locks set heartbeat_at = now() - interval '2 minutes' where buy_id = v_c;
  v := lock_acquire(v_c, bd, u2);
  perform pg_temp.ok(s, 'A lock not heard from for a minute can be taken', (v ->> 'held')::boolean);
  v := lock_acquire(v_c, a, u, true);
  perform pg_temp.ok(s, 'Take over takes it back', (v ->> 'held')::boolean);
  perform lock_release(v_c, bd);
  perform pg_temp.ok(s, 'Only the holder can let it go',
    exists (select 1 from collection_locks where buy_id = v_c and device_id = a));
  begin
    perform lock_acquire(gen_random_uuid(), a, u);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A collection that''s gone can''t be locked', sqlerrm, 'collection_gone');
  end;

  -- Cards.
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, bd, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only the computer with the lock can add cards', sqlerrm, 'not_lock_holder');
  end;
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, pg_temp.version(v_c) - 1, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… to the collection as it is now', sqlerrm, 'stale_version');
  end;
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 0, 1.00), true, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… at least one', sqlerrm, 'quantity must be at least 1');
  end;
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, null, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with a user', sqlerrm, 'no_user');
  end;
  c1 := collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00), true, u, a,
                            pg_temp.version(v_c), '2 Dbtest Bolt (DBT) 001');
  v_id := collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
  perform pg_temp.ok(s, 'The same card again adds to its line',
    v_id = c1 and (select quantity from buy_lines where id = c1) = 3);
  c2 := collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00, p_cond => 'MP'), true, u, a, null, null);
  cp := collection_add_line(v_c, pg_temp.line('Dbtestchu', 'DBTP', '025', 2, 4.00, 'pokemon'), true, u, a, null, null);
  perform pg_temp.ok(s, 'Each add is in the Changelog',
    (select count(*) from events where target_id = v_c and action = 'collection_cards_added') = 4);
  v_id := collection_update_line(c2, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u, a, null, 'old', 'new');
  perform pg_temp.ok(s, 'Editing a card into a copy of another merges them',
    v_id = c1 and (select quantity from buy_lines where id = c1) = 4 and not exists (select 1 from buy_lines where id = c2)
    and exists (select 1 from events where target_id = v_c and action = 'collection_line_edited' and summary = 'Card edited.'));
  perform collection_remove_line(c1, 1, u, a, null, '1 Dbtest Bolt (DBT) 001');
  perform pg_temp.ok(s, 'A card comes off', (select quantity from buy_lines where id = c1) = 3
    and exists (select 1 from events where target_id = v_c and action = 'collection_cards_removed' and removed = 1));
  begin
    perform collection_remove_line(gen_random_uuid(), 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Removing a card that''s gone is refused', sqlerrm, 'line_gone');
  end;

  -- Details.
  begin
    perform collection_update_info(v_c, '{"name": " "}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Details: a name is needed', sqlerrm, 'bad_name');
  end;
  begin
    perform collection_update_info(v_c, '{"phone": "555"}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a whole phone number', sqlerrm, 'bad_phone');
  end;
  begin
    perform collection_update_info(v_c, '{"id_last4": "TOOLONG"}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a last 4 ID of 4 at most', sqlerrm, 'bad_last4');
  end;
  begin
    perform collection_update_info(v_c, '{"custom_cash_pct": 120}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… rates from 0 to 100', sqlerrm, 'bad_pct');
  end;
  v_ver := pg_temp.version(v_c);
  perform collection_update_info(v_c, '{"notes": "a note"}', u, a, null);
  perform pg_temp.ok(s, 'Saving unchanged details changes nothing', pg_temp.version(v_c) = v_ver);
  perform collection_update_info(v_c, '{"name": "DBTEST Collection Two", "phone": "5550100006", "id_last4": "",
                                        "notes": "new", "custom_cash_pct": 40}', u, a, null);
  perform pg_temp.ok(s, 'Details are saved',
    (select customer_name = 'DBTEST Collection Two' and phone = '5550100006' and id_last4 is null and notes = 'new'
            and custom_cash_pct = 40 from buys where id = v_c));
  perform pg_temp.ok(s, 'The Changelog lists what changed',
    exists (select 1 from events where target_id = v_c and action = 'collection_info_edited'
              and summary = 'Details edited: name, phone, last 4 ID, notes, cash %.'
              and fields @> '[{"field": "cash %", "before": "50", "after": "40"}]'),
    (select summary || ' ' || fields::text from events where target_id = v_c and action = 'collection_info_edited'));
  perform pg_temp.ok(s, 'The customer is remembered under the new name and phone',
    exists (select 1 from customers where name_key = 'dbtest collection two' and phone = '5550100006'));

  -- REPRICE?
  v := collection_reprice(v_c, jsonb_build_array(jsonb_build_object('line_id', c1, 'unit_price', 2.00,
         'market_price', 4.00, 'price_source', 'justtcg', 'price_snapshot', '{}'::jsonb)), u, a, null);
  perform pg_temp.ok(s, 'REPRICE? reprices the lines it''s given',
    (v ->> 'lines')::integer = 1 and (v ->> 'before')::numeric = 11 and (v ->> 'after')::numeric = 14
    and (select unit_price from buy_lines where id = c1) = 2, v::text);
  perform pg_temp.ok(s, 'The Changelog has the market before and after',
    exists (select 1 from events where target_id = v_c and action = 'collection_repriced'
              and summary = 'Repriced at today''s prices: 1 card line, market $11 → $14.'));

  -- Import.
  begin
    perform collection_import(v_c, jsonb_build_array(pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)), u, a, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Import only fills an empty collection', sqlerrm, 'not_empty');
  end;
  v_i := collection_create('DBTEST Import', '5550100007', '', u, a);
  perform lock_acquire(v_i, a, u);
  begin
    perform collection_import(v_i, '[]', u, a, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with something to import', sqlerrm, 'nothing_to_import');
  end;
  begin
    perform collection_import(v_i, jsonb_build_array(pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')), u, a, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… of Magic cards', sqlerrm, 'import_magic_only');
  end;
  begin
    perform collection_import(v_i, jsonb_build_array(pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, -1.00)), u, a, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with prices of 0 or more', sqlerrm, 'bad_import_line');
  end;
  begin
    perform collection_import(v_i, jsonb_build_array(pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)), u, bd, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… from the computer with the lock', sqlerrm, 'not_lock_holder');
  end;
  v_n := collection_import(v_i, jsonb_build_array(
           pg_temp.line('Dbtest Bolt', 'DBT', '001', 3, 1.00) || '{"text": "3 Dbtest Bolt (DBT) 001"}',
           pg_temp.line('Dbtest Counterspell', 'DBT', '002', 1, 2.00, p_finish => 'foil')),
         u, a, pg_temp.version(v_i), 'dbtest.csv');
  perform pg_temp.ok(s, 'Import adds every card, priced as imported',
    v_n = 4 and (select count(*) from buy_lines where buy_id = v_i and price_source = 'import') = 2
    and (select array_agg(position order by position) from buy_lines where buy_id = v_i) = array[1, 2]);
  perform pg_temp.ok(s, 'The Changelog names the file',
    exists (select 1 from events where target_id = v_i and action = 'collection_imported'
              and summary = '4 cards imported from dbtest.csv.' and fields -> 0 ->> 'after' = 'dbtest.csv'
              and lines @> '[{"text": "3 Dbtest Bolt (DBT) 001"}]'));
  v_pi := project_import('DBTEST Import Project', 'n', jsonb_build_array(pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00)),
                         u, a, 'p.csv');
  perform pg_temp.ok(s, 'Import as a project makes a project with the cards',
    (select project and status = 'paid' from buys where id = v_pi)
    and (select sum(quantity) from buy_lines where buy_id = v_pi) = 2);
  begin
    perform project_import('DBTEST Nothing', '', '[]', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An empty file makes no project', sqlerrm, 'nothing_to_import');
  end;
  perform pg_temp.ok(s, '… and leaves none behind', not exists (select 1 from buys where customer_name = 'DBTEST Nothing'));

  perform pg_temp.put('coll', v_c::text);
  perform pg_temp.put('coll_bolt', c1::text);
  perform pg_temp.put('coll_pika', cp::text);
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- =============================================================== Statuses
do $$
declare
  s text := 'Statuses';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  v_c uuid := pg_temp.id('coll');
  c1 uuid := pg_temp.id('coll_bolt');
  cp uuid := pg_temp.id('coll_pika');
  v_pr uuid;
  v_d uuid;
  v_ver integer;
begin
  begin
    perform collection_set_status(v_c, 'lost', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only the five statuses', sqlerrm, 'bad_status');
  end;
  begin
    perform collection_set_status(v_c, 'priced', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Priced needs an offer', sqlerrm, 'offer_needed');
  end;
  begin
    perform collection_set_status(v_c, 'completed', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Completed comes after Paid/Ours', sqlerrm, 'complete_from_paid');
  end;
  begin
    perform collection_set_status(v_c, 'paid', u, a, null, null, null, p_paid_method => 'cash');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Paid/Ours needs the price paid', sqlerrm, 'paid_price_needed');
  end;
  begin
    perform collection_set_status(v_c, 'paid', u, a, null, null, null, p_paid_price => 5, p_paid_method => 'venmo');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… in cash or credit', sqlerrm, 'paid_method_needed');
  end;
  begin
    perform collection_set_status(v_c, 'priced', u, bd, null, null, null, 10);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only the computer with the lock changes it', sqlerrm, 'not_lock_holder');
  end;
  perform collection_set_status(v_c, 'priced', u, a, null, null, pg_temp.version(v_c), 10);
  perform pg_temp.ok(s, 'Priced keeps the offer, credit worked out from its rates (40% / master 65%)',
    (select status = 'priced' and offer_cash = 10 and offer_credit = 16 from buys where id = v_c));
  perform pg_temp.ok(s, 'The Changelog has the offer',
    exists (select 1 from events where target_id = v_c and action = 'collection_status_changed'
              and summary = 'Marked Priced: offered $10 cash / $16 credit.'));
  perform collection_set_status(v_c, 'processing', u, a, null, null, null);
  perform pg_temp.ok(s, 'Back to Processing', (select status = 'processing' from buys where id = v_c));

  perform collection_set_status(v_c, 'priced', u, a, null, null, null, 10);
  perform collection_set_status(v_c, 'rejected', u, a, null, null, null, p_reason => ' too low ');
  perform pg_temp.ok(s, 'Rejected keeps the reason and its rates',
    (select status = 'rejected' and rejected_reason = 'too low' and rejected_at is not null and cash_pct = 40
            and credit_pct = 65 from buys where id = v_c));
  perform pg_temp.ok(s, 'The Changelog has the reason',
    exists (select 1 from events where target_id = v_c and summary = 'Rejected: too low.'));
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Rejected: no cards added', sqlerrm, 'collection_rejected');
  end;
  begin
    perform collection_remove_line(c1, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or removed', sqlerrm, 'collection_rejected');
  end;
  begin
    perform collection_reprice(v_c, '[]', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or repriced', sqlerrm, 'collection_rejected');
  end;
  begin
    perform collection_update_info(v_c, '{"notes": "x"}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or details changed', sqlerrm, 'collection_rejected');
  end;
  begin
    perform collection_set_status(v_c, 'paid', u, a, null, null, null, p_paid_price => 5, p_paid_method => 'cash');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and only reopened to Priced or Processing', sqlerrm, 'rejected_reopen');
  end;
  perform pg_temp.ok(s, 'Rejected is out of the everyday search, in the full one',
    not exists (select 1 from global_search('dbtest bolt', null, null, null, false) where buy_id = v_c)
    and exists (select 1 from global_search('dbtest bolt', null, null, null, true) where buy_id = v_c and status = 'rejected'));
  perform collection_set_status(v_c, 'priced', u, a, null, null, null);
  perform pg_temp.ok(s, 'Reopened to Priced, the offer still stands',
    (select status = 'priced' and offer_cash = 10 and rejected_at is null and rejected_reason is null
            and cash_pct is null from buys where id = v_c));

  perform collection_set_status(v_c, 'paid', u, a, 33, 66, null, p_paid_price => 12, p_paid_method => 'cash');
  perform pg_temp.ok(s, 'Paid/Ours records what was paid and the rates (custom 40%, credit 66%)',
    (select status = 'paid' and paid_price = 12 and paid_method = 'cash' and paid_at is not null and cash_pct = 40
            and credit_pct = 66 from buys where id = v_c));
  perform pg_temp.ok(s, 'The Changelog says what was paid',
    exists (select 1 from events where target_id = v_c and summary = 'Marked Paid/Ours: paid $12 in cash, locked.'));
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Paid/Ours: no cards added', sqlerrm, 'collection_paid');
  end;
  begin
    perform collection_update_info(v_c, '{"notes": "y"}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… no details changed', sqlerrm, 'collection_paid');
  end;
  begin
    perform collection_reprice(v_c, '[]', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… no REPRICE?', sqlerrm, 'collection_paid');
  end;
  begin
    perform collection_set_status(v_c, 'rejected', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and it can''t be rejected', sqlerrm, 'reject_from');
  end;
  perform collection_remove_line(cp, 1, u, a, null, null);
  perform pg_temp.ok(s, 'Paid/Ours may still lose cards', (select quantity from buy_lines where id = cp) = 1);
  perform pg_temp.ok(s, 'Paid/Ours is in the everyday search',
    exists (select 1 from global_search('dbtest bolt', null, null, null, false)
             where buy_id = v_c and kind = 'collection' and collection_kind = 'collection'));
  v_ver := pg_temp.version(v_c);
  perform collection_set_status(v_c, 'paid', u, a, null, null, null, p_paid_price => 12, p_paid_method => 'cash');
  perform pg_temp.ok(s, 'Setting the same status again changes nothing', pg_temp.version(v_c) = v_ver);
  perform collection_set_status(v_c, 'processing', u, a, null, null, null);
  perform pg_temp.ok(s, 'Unlocked back to Processing, the payment goes',
    (select status = 'processing' and paid_price is null and paid_method is null and paid_at is null
            and cash_pct is null from buys where id = v_c)
    and exists (select 1 from events where target_id = v_c and summary = 'Unlocked: back to Processing.'));
  perform collection_set_status(v_c, 'paid', u, a, null, null, null, p_paid_price => 12, p_paid_method => 'cash');

  -- Projects.
  v_pr := project_create('DBTEST Project Two', ' a note ', u, a);
  perform lock_acquire(v_pr, a, u);
  perform pg_temp.ok(s, 'A project starts Paid/Ours, nothing paid yet',
    (select project and status = 'paid' and paid_price is null and notes = 'a note' from buys where id = v_pr)
    and exists (select 1 from events where target_id = v_pr and action = 'collection_created'
                  and summary = 'Project started: DBTEST Project Two.'));
  begin
    perform project_create(' ', '', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '+ Start Project needs a name', sqlerrm, 'bad_name');
  end;
  begin
    perform collection_set_status(v_pr, 'processing', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A project is only Paid/Ours or Completed', sqlerrm, 'project_status');
  end;
  begin
    perform collection_set_status(v_pr, 'rejected', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… never Rejected', sqlerrm, 'project_status');
  end;
  perform pg_temp.ok(s, 'A project takes cards while Paid/Ours',
    collection_add_line(v_pr, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null) is not null);
  perform pg_temp.ok(s, 'A project can be repriced', (collection_reprice(v_pr, '[]', u, a, null) ->> 'lines')::integer = 0);
  perform pg_temp.ok(s, 'Projects show as projects in search',
    exists (select 1 from global_search('dbtest bolt', null, null, null, false) where buy_id = v_pr and collection_kind = 'project'));
  perform pg_temp.put('project', v_pr::text);

  -- Delete.
  v_d := collection_create('DBTEST Delete Me', '5550100008', '', u, a);
  perform lock_acquire(v_d, a, u);
  perform collection_add_line(v_d, pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00), true, u, a, null, null);
  begin
    perform collection_delete(v_d, u, a, 'DBTEST Delete');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Delete needs the name typed', sqlerrm, 'name_mismatch');
  end;
  begin
    perform collection_delete(v_d, null, a, 'DBTEST Delete Me');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a user', sqlerrm, 'no_user');
  end;
  begin
    perform collection_delete(v_d, u, bd, 'DBTEST Delete Me');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and nobody else editing it', sqlerrm, 'locked_elsewhere');
  end;
  perform collection_delete(v_d, u, a, '  dbtest delete me ');
  perform pg_temp.ok(s, 'Delete takes the collection and its cards (the name in any case)',
    not exists (select 1 from buys where id = v_d) and not exists (select 1 from buy_lines where buy_id = v_d));
  perform pg_temp.ok(s, 'The Changelog keeps what was deleted',
    exists (select 1 from events where target_id = v_d and action = 'collection_deleted' and removed = 2
              and summary = 'Collection deleted with 2 cards.'));
  begin
    perform collection_delete(v_d, u, a, 'DBTEST Delete Me');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Deleting it again is refused', sqlerrm, 'collection_gone');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ===================================================== Master Inventory
do $$
declare
  s text := 'Inventory';
  u uuid := pg_temp.id('u1');
  v_old uuid := cc_current_file();
  v_f uuid;
  v_f2 uuid;
  v_n integer;
  v_path text;
  v_pruned text[];
  v_rows jsonb := '[
    {"product_id": "DBTEST-P1", "cc_id": "900001", "product_name": "Dbtest Bolt", "category": "DBTEST Set",
     "base_key": "dbtest bolt", "variants": [], "catalog_path": "Magic/DBTEST Set"},
    {"product_id": "DBTEST-P2", "cc_id": "900002", "product_name": "Dbtest Bolt - Foil", "category": "DBTEST Set",
     "base_key": "dbtest bolt", "foil_kind": "foil", "variants": [], "catalog_path": "Magic/DBTEST Set"},
    {"product_id": "DBTEST-P3", "cc_id": "900003", "product_name": "Dbtest Counterspell", "category": "DBTEST Promos",
     "base_key": "dbtest counterspell", "variants": [], "catalog_path": "Magic/DBTEST Promos"},
    {"product_id": "DBTEST-P4", "cc_id": "900004", "product_name": "Dbtest Mystery", "category": "DBTEST Promos",
     "base_key": "dbtest mystery", "variants": [], "catalog_path": "Magic/DBTEST Promos"}]';
begin
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform cc_products_load(gen_random_uuid(), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Signed out, loading products is refused', sqlerrm, 'not_signed_in');
  end;
  begin
    perform master_inventory_finish(gen_random_uuid());
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… so is finishing an upload', sqlerrm, 'not_signed_in');
  end;
  begin
    perform master_inventory_abort(gen_random_uuid());
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and abandoning one', sqlerrm, 'not_signed_in');
  end;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000d0b7","role":"authenticated"}', true);

  v_f := master_inventory_start('dbtest/inventory-dbtest.csv', 'inventory-dbtest.csv', 1234, 4,
                                array['Product Name', 'Category'], u);
  perform pg_temp.ok(s, 'An upload starts as not current',
    (select not is_current from master_inventory_files where id = v_f) and cc_current_file() is not distinct from v_old);
  v_n := cc_products_load(v_f, v_rows);
  perform pg_temp.ok(s, 'Its products load in batches', v_n = 4, v_n || ' loaded');
  perform pg_temp.ok(s, 'Loading the same products again updates them', cc_products_load(v_f, v_rows) = 4);
  begin
    perform cc_products_load(v_f, '{"product_id": "x"}');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A batch has to be a list', sqlerrm, 'bad_batch');
  end;
  begin
    perform cc_products_load(gen_random_uuid(), '[]');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Loading into an upload that''s gone is refused', sqlerrm, 'upload_gone');
  end;
  begin
    insert into cc_products (file_id, product_id, product_name, category, base_key) values (v_f, 'DBTEST-X', 'x', 'x', 'x');
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'Products can only be loaded through the server', sqlstate = '42501', sqlerrm);
  end;
  v_pruned := master_inventory_finish(v_f);
  perform pg_temp.ok(s, 'Finishing makes it the current file and drops the old one',
    cc_current_file() = v_f and (select products_loaded from master_inventory_files where id = v_f) = 4
    and (v_old is null or (not exists (select 1 from master_inventory_files where id = v_old) and cardinality(v_pruned) = 1)),
    'dropped ' || cardinality(v_pruned));
  begin
    perform cc_products_load(v_f, v_rows);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'The current file can''t be loaded into', sqlerrm, 'upload_gone');
  end;
  perform pg_temp.ok(s, 'Its categories are listed', cc_categories() = array['DBTEST Promos', 'DBTEST Set']);
  perform pg_temp.ok(s, 'Product search finds by name',
    (select count(*) from cc_products_search('dbtest bolt', 30)) = 2
    and (select product_id from cc_products_search('DBTEST BOLT', 1)) = 'DBTEST-P1');
  perform pg_temp.ok(s, '… needs two letters, and takes % literally',
    (select count(*) from cc_products_search('d', 30)) = 0 and (select count(*) from cc_products_search('db%lt', 30)) = 0);
  perform pg_temp.ok(s, 'Products by ID', (select product_name from cc_products_by_id(array['DBTEST-P3'])) = 'Dbtest Counterspell');
  perform pg_temp.ok(s, 'Candidates by base name and category',
    (select count(*) from cc_candidates('[{"key": "k", "category": "DBTEST Set", "base_keys": ["dbtest bolt"]}]')) = 2
    and (select count(*) from cc_candidates('[{"key": "k", "category": null, "base_keys": ["dbtest mystery", "dbtest bolt"]}]')) = 3);
  v_f2 := master_inventory_start('dbtest/inventory-dbtest-2.csv', 'inventory-dbtest-2.csv', 1, 0, '{}', u);
  v_path := master_inventory_abort(v_f2);
  perform pg_temp.ok(s, 'An unfinished upload can be abandoned',
    v_path = 'dbtest/inventory-dbtest-2.csv' and not exists (select 1 from master_inventory_files where id = v_f2));
  v_path := master_inventory_abort(v_f);
  perform pg_temp.ok(s, 'The current file can''t be', v_path is null and cc_current_file() = v_f);
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================================================= Export
do $$
declare
  s text := 'Export';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  d date := date '2001-02-03';
  v_num2 integer;
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
  v_sku text := internal.cc_custom_sku_day(date '2001-02-03');   -- the day exported (0071)
  b1 uuid;
  b2 uuid;
  b3 uuid;
  bolt uuid;
  foil uuid;
  pika uuid;
  cs uuid;
  mys uuid;
  v_target jsonb;
  v_matches jsonb;
  v jsonb;
  v_n integer;
begin
  perform pg_temp.ok(s, 'The test day (Feb 3, 2001) has no buys',
    not exists (select 1 from buys where kind = 'walk_in' and status = 'confirmed'
                 and (confirmed_at at time zone 'America/Los_Angeles')::date = d));
  b1 := pg_temp.buy(a, u, 'DBTEST Day One', '5550100009', array[
          pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00),
          pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 3.00, p_finish => 'foil'),
          pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  b2 := pg_temp.buy(a, u, 'DBTEST Day Two', '5550100010', array[
          pg_temp.line('Dbtest Counterspell', 'DBT', '002', 1, 2.00, p_cond => 'LP'),
          pg_temp.line('Dbtest Mystery', 'DBT', '003', 1, 0.50)]);
  update buys set confirmed_at = (d + time '12:00') at time zone 'America/Los_Angeles' where id = b1;
  update buys set confirmed_at = (d + time '12:05') at time zone 'America/Los_Angeles' where id = b2;
  select number into v_num2 from buys where id = b2;   -- its number, the next ever (0071)
  bolt := pg_temp.line_id(b1, 'Dbtest Bolt', 'nonfoil');
  foil := pg_temp.line_id(b1, 'Dbtest Bolt', 'foil');
  pika := pg_temp.line_id(b1, 'Dbtestchu');
  cs := pg_temp.line_id(b2, 'Dbtest Counterspell');
  mys := pg_temp.line_id(b2, 'Dbtest Mystery');
  v_target := jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg',
                'versions', jsonb_build_object(b1::text, pg_temp.version(b1), b2::text, pg_temp.version(b2)));
  v_matches := jsonb_build_array(pg_temp.match(bolt, 'DBTEST-P1', 1.25), pg_temp.match(foil, 'DBTEST-P2', 2.50, 'auto'),
                                 pg_temp.match(cs, 'DBTEST-P3', 0.40));

  begin
    perform export_lines('{"kind": "week"}', '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'EXPORT: only a day, a buy, a collection or Can''t upload', sqlerrm, 'bad_target');
  end;
  begin
    perform export_lines(v_target, v_matches, array[mys], '[]', null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with a user', sqlerrm, 'no_user');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'day', 'day', d, 'game', 'pokemon', 'versions', '{}'::jsonb), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… Magic only', sqlerrm, 'pokemon_export_unavailable');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'day', 'day', v_today, 'game', 'mtg', 'versions', '{}'::jsonb), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… not today', sqlerrm, 'day_not_over');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'day', 'day', d + 1, 'game', 'mtg', 'versions', '{}'::jsonb), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a day with something to export', sqlerrm, 'nothing_to_export');
  end;
  begin
    perform export_lines(jsonb_set(v_target, array['versions', b1::text], to_jsonb(pg_temp.version(b1) - 1)),
                         v_matches, array[mys], '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… its buys as they are now', sqlerrm, 'stale_version');
  end;
  begin
    perform export_lines(v_target, v_matches, '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… every card matched or marked can''t upload', sqlerrm, 'stale_version');
  end;
  begin
    perform export_lines(v_target, v_matches || pg_temp.match(mys, 'NOPE', 1), '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… to products in the current inventory', sqlerrm, 'stale_inventory');
  end;
  begin
    perform export_lines(v_target, v_matches || pg_temp.match(mys, 'DBTEST-P4', 0.39), '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… at $0.40 or more', sqlerrm, 'bad_price');
  end;

  v := export_lines(v_target, v_matches, array[mys],
                    '[{"scryfall_set": "DBT", "promo_kind": "", "category": "DBTEST Set"}]', u, a);
  perform pg_temp.ok(s, 'EXPORT answers with what it did',
    (v ->> 'buys')::integer = 2 and (v ->> 'cards')::integer = 4 and (v ->> 'cant')::integer = 1
    and v ->> 'sku' = v_sku and jsonb_array_length(v -> 'lines') = 4, v::text);
  perform pg_temp.ok(s, 'Matched cards are stamped for Crystal Commerce and Completed',
    (select cc_status = 'exported' and cc_product_id = 'DBTEST-P1' and cc_product_name = 'Dbtest Bolt'
            and cc_category = 'DBTEST Set' and cc_condition = 'Near Mint' and cc_sell_price = 1.25
            and cc_custom_sku = v_sku and cc_exported_at is not null and completed_at is not null and completed_by = u
       from buy_lines where id = bolt)
    and (select cc_condition = 'Lightly Played' and cc_sell_price = 0.40 from buy_lines where id = cs));
  perform pg_temp.ok(s, 'The unmatched card is marked Can''t upload',
    (select cc_status = 'cant_upload' and completed_at is not null from buy_lines where id = mys));
  perform pg_temp.ok(s, 'Pokémon cards are left as they were',
    (select completed_at is null and cc_status is null from buy_lines where id = pika));
  perform pg_temp.ok(s, 'A copy goes to Can''t upload cards, saying which buy',
    exists (select 1 from buy_lines c join buys x on x.id = c.buy_id
             where x.system_key = 'cant_upload' and c.source_line_id = mys
               and c.source_note = format('from Buy %s · February 3, 2001', v_num2)),
    (select c.source_note from buy_lines c where c.source_line_id = mys));
  perform pg_temp.ok(s, 'Search shows it in Can''t upload cards',
    exists (select 1 from global_search('dbtest mystery', null, null, null, false) where collection_kind = 'system'));
  perform pg_temp.ok(s, 'Each product picked is remembered for next time',
    exists (select 1 from cc_product_links where scryfall_id = 'dbtest-dbt-001' and finish = 'nonfoil'
              and product_id = 'DBTEST-P1' and source = 'staff' and linked_by = u)
    and exists (select 1 from cc_product_links where scryfall_id = 'dbtest-dbt-001' and finish = 'foil'
                  and product_id = 'DBTEST-P2' and source = 'auto'));
  perform pg_temp.ok(s, '… and the set''s category',
    exists (select 1 from cc_set_map where scryfall_set = 'dbt' and promo_kind = '' and category = 'DBTEST Set'
              and source = 'staff'));
  perform pg_temp.ok(s, 'The Changelog has the day''s export',
    exists (select 1 from events where action = 'day_exported' and day = d
              and summary = format('4 Magic cards exported (Custom SKU %s); 1 can''t upload, copied to Can''t upload cards.', v_sku)));
  perform pg_temp.ok(s, 'The calendar shows Magic exported',
    (select exported_games = array['mtg'] and completed_games = array['mtg']
       from buys_in_range(d::timestamptz - interval '1 day', d::timestamptz + interval '2 days') where id = b1));
  begin
    perform export_lines(jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg',
              'versions', jsonb_build_object(b1::text, pg_temp.version(b1), b2::text, pg_temp.version(b2))), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'The day can''t be exported twice', sqlerrm, 'nothing_to_export');
  end;
  perform pg_temp.ok(s, 'Paid/Ours again leaves exported cards alone (undo the export instead)',
    buy_mark_completed(b1, 'mtg', u, a, false) = 0);

  v_n := export_undo_day(d, 'mtg', u, a);
  perform pg_temp.ok(s, 'Undo puts the day back as it was',
    v_n = 2 and not exists (select 1 from buy_lines where id in (bolt, foil, cs, mys)
                             and (completed_at is not null or cc_status is not null or cc_custom_sku is not null)));
  perform pg_temp.ok(s, '… takes the copy back out of Can''t upload cards',
    not exists (select 1 from buy_lines where source_line_id = mys));
  perform pg_temp.ok(s, '… and says so in the Changelog',
    exists (select 1 from events where action = 'day_unexported' and day = d
              and summary = '2 Magic buys marked Paid/Ours again; 1 card taken back out of Can''t upload cards or Bulk pulled from exports.'));
  perform pg_temp.ok(s, 'Undoing again changes nothing', export_undo_day(d, 'mtg', u, a) = 0);
  begin
    perform export_undo_day(d, 'chess', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Undo: Magic or Pokémon only', sqlerrm, 'bad_day');
  end;

  -- Unexport one buy of an exported day.
  v := export_lines(jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg',
         'versions', jsonb_build_object(b1::text, pg_temp.version(b1), b2::text, pg_temp.version(b2))),
       v_matches, array[mys], '[]', u, a);
  v_n := buy_unexport(b2, 'mtg', u, a, pg_temp.version(b2));
  perform pg_temp.ok(s, 'One buy''s export can be undone on its own',
    v_n = 2 and (select cc_status is null and completed_at is null from buy_lines where id = cs)
    and not exists (select 1 from buy_lines where source_line_id = mys)
    and exists (select 1 from events where action = 'buy_unexported' and target_id = b2
                  and summary = '2 Magic cards marked Paid/Ours again; 1 card taken back out of Can''t upload cards or Bulk pulled from exports.'));
  perform pg_temp.ok(s, '… leaving the rest of the day exported', (select cc_status = 'exported' from buy_lines where id = bolt));
  perform pg_temp.ok(s, 'Nothing left to undo changes nothing', buy_unexport(b2, 'mtg', u, a) = 0);
  begin
    perform buy_unexport(b2, 'chess', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… Magic or Pokémon only', sqlerrm, 'bad_game');
  end;
  -- Mark as completed strikes a Magic buy's cards (0073); undoing an export leaves them so (0078).
  perform buy_mark_completed(b2, 'mtg', u, a, true);
  v_n := buy_unexport(b2, 'mtg', u, a, pg_temp.version(b2));
  perform pg_temp.ok(s, 'Undoing one buy''s export leaves its hand-completed Magic cards Completed and struck (0078)',
    v_n = 0
    and (select struck_at = completed_at and struck_by is not null from buy_lines where id = cs)
    and (select struck_at = completed_at from buy_lines where id = mys));
  v_n := export_undo_day(d, 'mtg', u, a);
  perform pg_temp.ok(s, '… and so does the day''s: only the exported buy comes back (0078)',
    v_n = 1 and (select completed_at is null and cc_status is null from buy_lines where id = bolt)
    and (select struck_at = completed_at from buy_lines where id = cs));
  v_n := buy_mark_completed(b2, 'mtg', u, a, false);
  perform pg_temp.ok(s, '… and the buy''s own Paid/Ours again still brings them back',
    v_n = 2
    and (select struck_at is null and struck_by is null and completed_at is null from buy_lines where id = cs)
    and (select struck_at is null and completed_at is null from buy_lines where id = mys));
  -- Back as it was: the day exported, then this buy's export undone.
  perform export_lines(jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg',
            'versions', jsonb_build_object(b1::text, pg_temp.version(b1), b2::text, pg_temp.version(b2))),
          v_matches, array[mys], '[]', u, a);
  perform buy_unexport(b2, 'mtg', u, a, pg_temp.version(b2));

  -- Export single buy.
  begin
    perform export_lines(jsonb_build_object('kind', 'buy', 'game', 'pokemon', 'buy_id', b2, 'version', pg_temp.version(b2)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Export single buy: Magic only', sqlerrm, 'pokemon_export_unavailable');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', gen_random_uuid(), 'version', 1), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… a buy that''s still there', sqlerrm, 'buy_gone');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', b2, 'version', pg_temp.version(b2) - 1),
                         jsonb_build_array(pg_temp.match(cs, 'DBTEST-P3', 0.40)), array[mys], '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… as it is now', sqlerrm, 'stale_version');
  end;
  v := export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', b2, 'version', pg_temp.version(b2)),
                    jsonb_build_array(pg_temp.match(cs, 'DBTEST-P3', 0.40)), array[mys], '[]', u, a);
  perform pg_temp.ok(s, 'Export single buy exports just that buy',
    (v ->> 'buys')::integer = 1 and (v ->> 'cards')::integer = 1 and (v ->> 'cant')::integer = 1
    and (select cc_status = 'exported' and completed_at is not null from buy_lines where id = cs), v::text);
  perform pg_temp.ok(s, '… its copy says which buy',
    exists (select 1 from buy_lines where source_line_id = mys and source_note = format('from Buy %s · Sat Feb 3, 2001', v_num2)),
    (select source_note from buy_lines where source_line_id = mys));
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where action = 'buy_exported' and target_id = b2
              and summary = format('1 Magic card exported on its own (Custom SKU %s-%s); 1 can''t upload, copied to Can''t upload cards; the buy is Completed.', v_sku, v_num2)));
  begin
    perform export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', b2, 'version', pg_temp.version(b2)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and only once', sqlerrm, 'nothing_to_export');
  end;
  b3 := pg_temp.buy(a, u, 'DBTEST Today', '5550100011', array[pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)]);
  v := export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', b3, 'version', pg_temp.version(b3)),
                    jsonb_build_array(pg_temp.match(pg_temp.line_id(b3, 'Dbtest Bolt'), 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
  perform pg_temp.ok(s, 'A buy from today can be exported on its own', (v ->> 'cards')::integer = 1);

  -- COMPLETE (Pokémon).
  begin
    perform day_complete(v_today, 'pokemon', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'COMPLETE: not today', sqlerrm, 'day_not_over');
  end;
  begin
    perform day_complete(d, 'chess', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… Magic or Pokémon', sqlerrm, 'bad_day');
  end;
  begin
    perform day_complete(d, 'pokemon', null, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with a user', sqlerrm, 'no_user');
  end;
  begin
    perform day_complete(d, 'pokemon', u, a, jsonb_build_array(jsonb_build_object('line_id', pika, 'sell_price', -1)));
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with Sell Prices of 0 or more', sqlerrm, 'bad_price');
  end;
  v_n := day_complete(d, 'pokemon', u, a, jsonb_build_array(jsonb_build_object('line_id', pika, 'sell_price', 6.5,
                      'sell_basis', '{"test": "dbtest"}'::jsonb)));
  perform pg_temp.ok(s, 'COMPLETE marks the day''s Pokémon cards Completed, with their Sell Prices',
    v_n = 1 and (select completed_at is not null and cc_sell_price = 6.5 and cc_status is null from buy_lines where id = pika));
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where action = 'day_completed' and day = d
              and summary = '1 Pokémon buy (1 card) marked Completed, not exported.'));
  perform pg_temp.ok(s, 'Completing again changes nothing', day_complete(d, 'pokemon', u, a) = 0);
  v_n := buy_mark_completed(b1, 'pokemon', u, a, false);
  perform pg_temp.ok(s, 'Paid/Ours again takes COMPLETE''s Sell Prices away',
    v_n = 1 and (select completed_at is null and cc_sell_price is null and cc_sell_basis is null from buy_lines where id = pika));

  perform pg_temp.put('day_mystery', mys::text);
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ==================================================== Export a collection
do $$
declare
  s text := 'Export';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  bd uuid := pg_temp.id('devB');
  v_c uuid := pg_temp.id('coll');
  c1 uuid := pg_temp.id('coll_bolt');
  cp uuid := pg_temp.id('coll_pika');
  v_sku text := internal.cc_custom_sku(now());
  v_x uuid;
  v_c3 uuid;
  v_pp uuid;
  v_id uuid;
  v jsonb;
begin
  v_x := collection_create('DBTEST Not Paid', null, '', u, a);
  perform lock_acquire(v_x, a, u);
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_x, 'version', pg_temp.version(v_x)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A collection is exported once Paid/Ours', sqlerrm, 'collection_not_paid');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… every Magic card matched or marked', sqlerrm, 'stale_version');
  end;
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)),
                         jsonb_build_array(pg_temp.match(c1, 'DBTEST-P1', 1.25)), '{}', '[]', u, bd);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… from the computer with the lock', sqlerrm, 'not_lock_holder');
  end;
  v := export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)),
                    jsonb_build_array(pg_temp.match(c1, 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
  perform pg_temp.ok(s, 'EXPORT stamps a Paid/Ours collection''s Magic cards; its status stays (0073)',
    (v ->> 'cards')::integer = 3 and v ->> 'sku' = v_sku
    and (select status = 'paid' and completed_at is null from buys where id = v_c)
    and (select cc_status = 'exported' from buy_lines where id = c1)
    and (select cc_status is null from buy_lines where id = cp), v::text);
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where target_id = v_c and action = 'collection_exported'
              and summary = format('Exported 3 cards (Custom SKU %s).', v_sku)));
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… only once', sqlerrm, 'nothing_to_export');
  end;
  perform collection_set_status(v_c, 'completed', u, a, null, null, null);
  perform pg_temp.ok(s, 'Completed is set by hand, from Paid/Ours (0073)',
    (select status = 'completed' and completed_at is not null from buys where id = v_c)
    and exists (select 1 from events where target_id = v_c and summary = 'Marked Completed.'));
  begin
    perform collection_add_line(v_c, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Completed: no cards added', sqlerrm, 'collection_completed');
  end;
  begin
    perform collection_remove_line(cp, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or removed', sqlerrm, 'collection_completed');
  end;
  perform pg_temp.ok(s, 'Completed is out of the everyday search, in the full one',
    not exists (select 1 from global_search('dbtest bolt', null, null, null, false) where buy_id = v_c)
    and exists (select 1 from global_search('dbtest bolt', null, null, null, true) where buy_id = v_c and status = 'completed'));
  perform collection_set_status(v_c, 'paid', u, a, null, null, null);
  perform pg_temp.ok(s, 'Reopening a Completed collection changes the status only: the export stays (0073)',
    (select status = 'paid' and completed_at is null from buys where id = v_c)
    and (select cc_status = 'exported' and cc_custom_sku = v_sku from buy_lines where id = c1)
    and exists (select 1 from events where target_id = v_c
                  and summary = 'Reopened: back to Paid/Ours, still locked.'));
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)), '[]', array[c1], '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An exported card isn''t exported again', sqlerrm, 'nothing_to_export');
  end;
  begin
    perform collection_unexport(v_c, u, bd, pg_temp.version(v_c));
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Undo export needs the lock (0074)', sqlerrm, 'not_lock_holder');
  end;
  v := collection_unexport(v_c, u, a, pg_temp.version(v_c));
  perform pg_temp.ok(s, 'Undo export takes the stamps off; the status stays (0074)',
    (v ->> 'cards')::integer = 3 and (v ->> 'returned')::integer = 0
    and (select status = 'paid' from buys where id = v_c)
    and (select cc_status is null and cc_custom_sku is null and cc_sell_price is null and cc_product_id is null
           from buy_lines where id = c1), v::text);
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where target_id = v_c and action = 'collection_unexported'
              and summary = format('Export undone (Custom SKU %s): 3 cards no longer marked exported.', v_sku)));
  begin
    perform collection_unexport(v_c, u, a, pg_temp.version(v_c));
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… once', sqlerrm, 'nothing_to_undo');
  end;
  v := export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)),
                    jsonb_build_array(pg_temp.match(c1, 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
  perform pg_temp.ok(s, '… and EXPORT offers the cards again',
    (v ->> 'cards')::integer = 3 and (select cc_status = 'exported' and cc_custom_sku = v_sku from buy_lines where id = c1), v::text);
  -- An exported card is frozen (0081): in a Paid/Ours customer collection, × can't remove or strike it.
  begin
    perform collection_remove_line(c1, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An exported card can''t be removed (0081)', sqlerrm, 'line_exported');
  end;
  begin
    perform collection_strike_line(c1, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor struck', sqlerrm, 'line_exported');
  end;
  v_x := collection_create('DBTEST Collection Three', null, '', u, a);
  perform lock_acquire(v_x, a, u);
  perform collection_add_line(v_x, pg_temp.line('Dbtest Mystery', 'DBT', '003', 2, 1.00), true, u, a, null, null);
  select id into v_c3 from buy_lines where buy_id = v_x;
  perform collection_set_status(v_x, 'paid', u, a, null, null, null, p_paid_price => 2, p_paid_method => 'cash');
  v := export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_x, 'version', pg_temp.version(v_x)), '[]', array[v_c3], '[]', u, a);
  perform pg_temp.ok(s, 'A collection''s card that can''t upload is copied, saying where from',
    (v ->> 'cant')::integer = 2 and v ->> 'sku' is null
    and exists (select 1 from buy_lines where source_line_id = v_c3 and source_note = 'from DBTEST Collection Three'));
  perform collection_set_status(v_x, 'completed', u, a, null, null, null);
  perform collection_set_status(v_x, 'paid', u, a, null, null, null);
  perform pg_temp.ok(s, '… and a status change leaves the copy where it is (0073)',
    exists (select 1 from buy_lines where source_line_id = v_c3)
    and (select cc_status = 'cant_upload' from buy_lines where id = v_c3));
  v := collection_unexport(v_x, u, a, pg_temp.version(v_x));
  perform pg_temp.ok(s, 'Undo export brings its copy back out of Can''t upload cards (0074)',
    (v ->> 'cards')::integer = 2 and (v ->> 'returned')::integer = 2
    and not exists (select 1 from buy_lines where source_line_id = v_c3)
    and (select cc_status is null from buy_lines where id = v_c3)
    and exists (select 1 from events where target_id = v_x and action = 'collection_unexported'
                  and summary = 'Export undone: 2 cards no longer marked exported; 2 taken back out of Can''t upload cards or Bulk pulled from exports.'), v::text);

  v_pp := project_create('DBTEST Pokémon Project', '', u, a);
  perform lock_acquire(v_pp, a, u);
  perform collection_add_line(v_pp, pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon'), true, u, a, null, null);
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_pp, 'version', pg_temp.version(v_pp)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A project of only Pokémon cards has nothing to export (0073)', sqlerrm, 'nothing_to_export');
  end;
  perform collection_set_status(v_pp, 'completed', u, a, null, null, null);
  perform pg_temp.ok(s, 'A project is marked Completed by hand',
    (select status = 'completed' and completed_at is not null from buys where id = v_pp)
    and exists (select 1 from events where target_id = v_pp and summary = 'Marked Completed.'));
  begin
    perform project_to_buy(v_pp, u, a, 'DBTEST Gary', '5550100004', 1, 'cash', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Completed project can''t be converted to a buy', sqlerrm, 'project_completed');
  end;
  v_pp := project_create('DBTEST Exported Project', '', u, a);
  perform lock_acquire(v_pp, a, u);
  perform collection_add_line(v_pp, pg_temp.line('Dbtest Mystery', 'DBT', '004', 1, 1.00), true, u, a, null, null);
  perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_pp, 'version', pg_temp.version(v_pp)), '[]',
                       array(select id from buy_lines where buy_id = v_pp), '[]', u, a);
  begin
    perform project_to_buy(v_pp, u, a, 'DBTEST Gary', '5550100004', 1, 'cash', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An exported project can''t be converted to a buy (0077)', sqlerrm, 'project_exported');
  end;
  v := collection_reprice(v_pp, jsonb_build_array(jsonb_build_object('line_id', (select id from buy_lines where buy_id = v_pp),
         'unit_price', 9.00, 'market_price', 9.00, 'price_source', 'justtcg', 'price_snapshot', '{}'::jsonb)), u, a, null);
  perform pg_temp.ok(s, 'REPRICE? leaves an exported card''s price (0081)',
    (v ->> 'lines')::integer = 0 and (select unit_price = 1.00 from buy_lines where buy_id = v_pp), v::text);
  -- In a project, still open to adding and editing (0081).
  select id into v_c3 from buy_lines where buy_id = v_pp;
  v_id := collection_add_line(v_pp, (select jsonb_set(to_jsonb(l), '{quantity}', '1') from buy_lines l where l.id = v_c3),
                              true, u, a, null, null);
  perform pg_temp.ok(s, 'A copy of an exported card goes on a line of its own, never into the exported one (0081)',
    v_id <> v_c3 and (select cc_status is null from buy_lines where id = v_id)
    and (select quantity = 1 from buy_lines where id = v_c3));
  begin
    perform collection_update_line(v_c3, (select to_jsonb(l) from buy_lines l where l.id = v_c3), u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… an exported card can''t be edited', sqlerrm, 'line_exported');
  end;
  perform collection_update_line(v_id, (select to_jsonb(l) from buy_lines l where l.id = v_id), u, a, null, null, null);
  perform pg_temp.ok(s, '… nor does an edit fold the new copy into it',
    (select count(*) from buy_lines where buy_id = v_pp) = 2 and (select quantity = 1 from buy_lines where id = v_c3));
  begin
    perform collection_remove_line(v_c3, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and × on it refuses', sqlerrm, 'line_exported');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ===================================================== Can't upload cards
do $$
declare
  s text := 'Can''t upload';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  mys uuid := pg_temp.id('day_mystery');
  v_s uuid;
  v_copy uuid;
  v_others uuid[];
  v jsonb;
begin
  v_s := cant_upload_ensure();
  perform pg_temp.ok(s, 'There''s always exactly one',
    cant_upload_ensure() = v_s and (select count(*) from buys where system_key = 'cant_upload') = 1
    and (select status = 'paid' and customer_name = 'Can''t upload cards' from buys where id = v_s));
  perform lock_acquire(v_s, a, u, true);
  begin
    perform collection_add_line(v_s, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'No cards can be added by hand', sqlerrm, 'system_collection');
  end;
  begin
    perform collection_update_info(v_s, '{"notes": "x"}', u, a, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor its details changed', sqlerrm, 'system_collection');
  end;
  begin
    perform collection_import(v_s, jsonb_build_array(pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)), u, a, null, 'x.csv');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor a file imported', sqlerrm, 'system_collection');
  end;
  begin
    perform collection_set_status(v_s, 'processing', u, a, null, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor its status changed', sqlerrm, 'system_collection');
  end;
  begin
    perform collection_delete(v_s, u, a, 'Can''t upload cards');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor deleted', sqlerrm, 'system_collection');
  end;

  v_copy := (select id from buy_lines where buy_id = v_s and source_line_id = mys);
  v_others := array(select id from buy_lines where buy_id = v_s and game = 'mtg' and id <> v_copy);
  begin
    perform export_lines(jsonb_build_object('kind', 'cant_upload', 'version', pg_temp.version(v_s) - 1),
                         jsonb_build_array(pg_temp.match(v_copy, 'DBTEST-P4', 0.50)), v_others, '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Its EXPORT needs it as it is now', sqlerrm, 'stale_version');
  end;
  v := export_lines(jsonb_build_object('kind', 'cant_upload', 'version', pg_temp.version(v_s)),
                    jsonb_build_array(pg_temp.match(v_copy, 'DBTEST-P4', 0.50)), v_others, '[]', u, a);
  perform pg_temp.ok(s, 'A card that now matches is exported and leaves',
    (v ->> 'cards')::integer = 1 and not exists (select 1 from buy_lines where id = v_copy), v::text);
  perform pg_temp.ok(s, '… and the buy''s own line is now exported',
    (select cc_status = 'exported' and cc_product_id = 'DBTEST-P4' and cc_sell_price = 0.50 from buy_lines where id = mys));
  perform pg_temp.ok(s, 'Cards that still can''t upload stay',
    (select count(*) from buy_lines where id = any(v_others)) = cardinality(v_others));
  perform pg_temp.ok(s, 'The Changelog says so',
    exists (select 1 from events where target_id = v_s and action = 'cant_upload_exported'
              and summary like 'Exported 1 card (Custom SKU %)%.'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ================================= Changelog entries the app asks for (0064)
do $$
declare
  s text := 'Changelog entries';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  c uuid;
begin
  c := collection_create('DBTEST Called', null, '', u, a);
  perform collection_log_call(c, u, a, 'Called DBTEST Called about their collection.');
  perform pg_temp.ok(s, 'Called: a collection entry, signed with the user as staff_users has them',
    exists (select 1 from events e join staff_users su on su.id = u
             where e.action = 'collection_called' and e.kind = 'collection' and e.target_id = c
               and e.target_name = 'DBTEST Called' and e.staff_user_name = su.name
               and e.staff_user_color = su.color and e.device_id = a
               and e.summary = 'Called DBTEST Called about their collection.'));
  begin
    perform collection_log_call(c, null, a, 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A call with no user is refused', sqlerrm, 'no_user');
  end;
  begin
    perform collection_log_call(gen_random_uuid(), u, a, 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A call on a collection that''s gone is refused', sqlerrm, 'collection_gone');
  end;

  perform buy_log_cash_download('2026-09-17', u, a, 'Cash buys for September 2026 downloaded: 0 buys, $0.00 paid in cash.');
  perform pg_temp.ok(s, 'Cash buys downloaded: a buy entry on the month''s first day, titled by the database',
    exists (select 1 from events
             where action = 'cash_buys_downloaded' and kind = 'buy' and day = '2026-09-01'
               and target_name = 'Cash buys · September 2026' and target_id is null
               and staff_user_id = u and device_id = a
               and summary = 'Cash buys for September 2026 downloaded: 0 buys, $0.00 paid in cash.'));
  begin
    perform buy_log_cash_download('2026-09-01', null, a, 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A download with no user is refused', sqlerrm, 'no_user');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ===================================================== Scan sessions (0068)
do $$
declare
  s text := 'Scan sessions';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  b uuid := pg_temp.id('devB');
  ph uuid := gen_random_uuid();
  ph2 uuid := gen_random_uuid();
  c uuid;
  v jsonb;
begin
  insert into devices (id, label) values (ph, 'DBTEST Phone'), (ph2, 'DBTEST Phone Two');
  v := scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg,pokemon}', null, null);
  perform pg_temp.ok(s, 'A price screen opens a session; with no user picked it can''t take cards',
    v ->> 'device_label' = 'DBTEST Computer A' and v ->> 'target_name' = 'Buy list'
    and (v ->> 'can_add')::boolean = false, v::text);
  v := scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg,pokemon}', u, null);
  perform pg_temp.ok(s, '… with a user picked and Magic on, it can',
    (v ->> 'can_add')::boolean and v ->> 'staff_user_name' = 'DBTEST Cashier', v::text);
  v := scan_session_touch(a, 'walk_in', null, 'Buy list', '{pokemon}', u, null);
  perform pg_temp.ok(s, '… not with only Pokémon on', (v ->> 'can_add')::boolean = false, v::text);
  v := scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg}', u, 'Paid/Ours: unlock it to edit');
  perform pg_temp.ok(s, '… nor while its list is locked, which says why',
    (v ->> 'can_add')::boolean = false and v ->> 'locked' = 'Paid/Ours: unlock it to edit', v::text);
  perform scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg,pokemon}', u, '  ');
  perform pg_temp.ok(s, 'Phones see it listed', exists (select 1 from scan_sessions_open() o where o.device_id = a and o.can_add));

  v := scan_pair(a, ph);
  perform pg_temp.ok(s, 'A phone pairs with it', v ->> 'phone_label' = 'DBTEST Phone' and (v ->> 'scanned')::integer = 0, v::text);
  perform pg_temp.ok(s, 'The paired phone''s heartbeat is answered', scan_phone_beat(a, ph));
  perform pg_temp.ok(s, '… another phone''s isn''t', not scan_phone_beat(a, ph2));
  begin
    perform scan_pair(a, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A computer can''t pair with itself', sqlerrm, 'not_a_device');
  end;
  begin
    perform scan_pair(a, gen_random_uuid());
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A phone has to be a named device', sqlerrm, 'not_a_device');
  end;
  begin
    perform scan_pair(b, ph2);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A computer with no price screen open can''t be paired', sqlerrm, 'session_gone');
  end;
  perform scan_session_touch(b, 'walk_in', null, 'Buy list', '{pokemon}', u, null);
  begin
    perform scan_pair(b, ph2);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor one on Pokémon only', sqlerrm, 'cannot_scan');
  end;

  v := scan_pair(a, ph2);
  perform pg_temp.ok(s, 'A second phone replaces the first (one phone per computer)',
    v ->> 'phone_label' = 'DBTEST Phone Two' and not scan_phone_beat(a, ph), v::text);
  perform scan_session_touch(b, 'walk_in', null, 'Buy list', '{mtg}', u, null);
  perform scan_pair(b, ph2);
  perform pg_temp.ok(s, 'A phone pairing elsewhere leaves the first computer (one computer per phone)',
    (select phone_device_id is null from scan_sessions where device_id = a)
    and (select phone_device_id = ph2 from scan_sessions where device_id = b));
  update scan_sessions set scanned = 5 where device_id = b;
  perform scan_pair(b, ph2);
  perform pg_temp.ok(s, 'The same phone pairing again keeps its count', (select scanned from scan_sessions where device_id = b) = 5);
  perform scan_pair(b, ph);
  perform pg_temp.ok(s, '… a new phone starts it again', (select scanned from scan_sessions where device_id = b) = 0);

  c := collection_create('DBTEST Scan Target', null, '', u, a);
  v := scan_session_touch(a, 'collection', c, 'DBTEST Scan Target', '{mtg,pokemon}', u, null);
  perform pg_temp.ok(s, 'A collection''s screen is a session too',
    v ->> 'target_kind' = 'collection' and (v ->> 'buy_id')::uuid = c, v::text);
  begin
    perform scan_session_touch(a, 'collection', null, 'x', '{mtg}', u, null);
    raise exception 'dbt_no_error';
  exception when others then
    perform pg_temp.ok(s, 'A collection session names its collection', sqlstate = '23514', sqlerrm);
  end;

  update scan_sessions set heartbeat_at = now() - interval '2 minutes' where device_id = b;
  perform pg_temp.ok(s, 'A session with no beat for a minute isn''t listed',
    not exists (select 1 from scan_sessions_open() o where o.device_id = b));
  perform pg_temp.ok(s, '… and its phone''s heartbeat isn''t answered', not scan_phone_beat(b, ph));
  begin
    perform scan_pair(b, ph2);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor can it be paired', sqlerrm, 'session_stale');
  end;
  v := scan_session_touch(b, 'walk_in', null, 'Buy list', '{mtg}', u, null);
  perform pg_temp.ok(s, 'Back again, it has lost its phone', v ->> 'phone_device_id' is null, v::text);

  perform scan_pair(a, ph);
  perform scan_unpair(a, ph2);
  perform pg_temp.ok(s, 'A phone that isn''t paired can''t unpair another',
    (select phone_device_id = ph from scan_sessions where device_id = a));
  perform scan_unpair(a, null);
  perform pg_temp.ok(s, 'The computer''s Unpair lets its phone go',
    (select phone_device_id is null and paired_at is null from scan_sessions where device_id = a));
  begin
    perform scan_unpair(gen_random_uuid(), null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Unpairing a session that''s gone is refused', sqlerrm, 'session_gone');
  end;
  begin
    perform scan_session_touch(gen_random_uuid(), 'walk_in', null, 'Buy list', '{mtg}', u, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An unnamed computer can''t open a session', sqlerrm, 'no_device');
  end;
  perform scan_pair(a, ph);
  perform collection_delete(c, u, a, 'DBTEST Scan Target');
  perform pg_temp.ok(s, 'Deleting the collection ends its session', not exists (select 1 from scan_sessions where device_id = a));
  perform scan_session_end(b);
  perform pg_temp.ok(s, 'Leaving the price screen ends the session', not exists (select 1 from scan_sessions where device_id = b));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================================ Scans (0069)
do $$
declare
  s text := 'Scans';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  ph uuid := gen_random_uuid();
  ph2 uuid := gen_random_uuid();
  card jsonb := '{"scryfall_id": "dbtest-scan-1", "name": "DBTEST Bolt", "set_code": "DBT",
                  "collector_number": "7", "finish": "nonfoil", "condition": "LP", "tier": 1}';
  v_id uuid;
  v_line uuid;
  v jsonb;
begin
  insert into devices (id, label) values (ph, 'DBTEST Scan Phone'), (ph2, 'DBTEST Scan Phone Two');
  perform scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg}', u, null);
  perform scan_pair(a, ph);

  v_id := scan_send(a, ph, card);
  perform pg_temp.ok(s, 'The paired phone sends a card; it waits for the computer',
    (select status = 'sent' and finish = 'nonfoil' and condition = 'LP' and tier = 1 and name = 'DBTEST Bolt'
       from scans where id = v_id));
  -- The same scan sent again (a retry after no answer in time): saved once (0075).
  declare
    v_once uuid;
    v_again uuid;
  begin
    v_once := scan_send(a, ph, card || '{"client_id": "0b5c2d8e-1f3a-4c6b-9d7e-2a1b3c4d5e6f"}');
    v_again := scan_send(a, ph, card || '{"client_id": "0b5c2d8e-1f3a-4c6b-9d7e-2a1b3c4d5e6f"}');
    perform pg_temp.ok(s, 'A scan sent twice with its id is saved once (0075)',
      v_once = v_again and v_once <> v_id
      and (select count(*) from scans where phone_device_id = ph and client_id = '0b5c2d8e-1f3a-4c6b-9d7e-2a1b3c4d5e6f') = 1);
    perform pg_temp.ok(s, '… and another id is another scan',
      scan_send(a, ph, card || '{"client_id": "1c6d3e9f-2a4b-4d7c-8e8f-3b2c4d5e6f70"}') <> v_once);
    delete from scans where phone_device_id = ph and client_id is not null;
  end;
  begin
    perform scan_send(a, ph2, card);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only the paired phone can send', sqlerrm, 'not_paired');
  end;
  begin
    perform scan_send(a, ph, card || '{"finish": "shiny"}');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A scan needs a finish the app knows', sqlerrm, 'bad_scan');
  end;
  begin
    perform scan_send(a, ph, card - 'scryfall_id');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a printing', sqlerrm, 'bad_scan');
  end;
  perform scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg}', null, null);
  begin
    perform scan_send(a, ph, card);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Nothing is sent while the computer has no user picked', sqlerrm, 'cannot_add');
  end;
  perform scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg}', u, null);

  v := scan_claim(v_id, a);
  perform pg_temp.ok(s, 'The computer claims it to price it', v ->> 'status' = 'pricing', v::text);
  perform pg_temp.ok(s, '… once', scan_claim(v_id, a) is null);
  begin
    perform scan_resolve(v_id, ph, 'failed', null, null, null, 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only its computer says how it went', sqlerrm, 'not_session');
  end;
  perform draft_for_device(a, u);
  v_line := draft_add_line(a, pg_temp.line('DBTEST Bolt', 'DBT', '7', 1, 0.45), u, true);
  perform scan_resolve(v_id, a, 'added', v_line, 0.45, 'scryfall_fallback', null);
  perform pg_temp.ok(s, 'Added: the line and its quantity, the price, and the phone''s count',
    (select status = 'added' and line_id = v_line and line_qty = 1 and price = 0.45 and price_source = 'scryfall_fallback'
       from scans where id = v_id)
    and (select scanned from scan_sessions where device_id = a) = 1);
  begin
    perform scan_resolve(v_id, a, 'failed', null, null, null, 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A scan is resolved once', sqlerrm, 'bad_status');
  end;

  v_id := scan_send(a, ph, card);
  perform scan_claim(v_id, a);
  perform scan_resolve(v_id, a, 'needs_price', null, null, null, null);
  begin
    perform scan_answer(v_id, ph2, 1);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only its phone answers a scan with no price', sqlerrm, 'not_phone');
  end;
  begin
    perform scan_answer(v_id, ph, 0);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with a price over $0', sqlerrm, 'bad_price');
  end;
  perform scan_answer(v_id, ph, 2.50);
  perform pg_temp.ok(s, 'A price sends it back to the computer',
    (select status = 'sent' and manual_price = 2.50 from scans where id = v_id));
  begin
    perform scan_answer(v_id, ph, 3);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… answered once', sqlerrm, 'not_waiting');
  end;
  perform scan_claim(v_id, a);
  perform scan_resolve(v_id, a, 'needs_price', null, null, null, null);
  perform scan_answer(v_id, ph, null);
  perform pg_temp.ok(s, 'No price skips it', (select status = 'skipped' from scans where id = v_id));

  -- Undo last scan (0070): the phone asks, the computer takes one copy off and says so.
  v_id := scan_send(a, ph, card);
  perform scan_claim(v_id, a);
  perform scan_resolve(v_id, a, 'added', v_line, 0.45, 'scryfall_fallback', null);
  begin
    perform scan_undo(v_id, ph2);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only its phone can undo a scan', sqlerrm, 'not_phone');
  end;
  perform scan_undo(v_id, ph);
  perform pg_temp.ok(s, 'Undo asks the computer to take it off', (select status = 'undo' from scans where id = v_id));
  v := scan_claim(v_id, a);
  perform pg_temp.ok(s, '… which takes the undo on', v ->> 'status' = 'undoing', v::text);
  perform draft_remove_line(v_line, 1, u);
  perform scan_resolve(v_id, a, 'undone', null, null, null, null);
  perform pg_temp.ok(s, 'Undone: one card fewer on the phone''s count',
    (select status = 'undone' from scans where id = v_id) and (select scanned from scan_sessions where device_id = a) = 1);
  begin
    perform scan_undo(v_id, ph);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A scan is undone once', sqlerrm, 'not_added');
  end;

  v_id := scan_send(a, ph, card);
  perform scan_claim(v_id, a);
  perform pg_temp.ok(s, 'A claim is held while it''s fresh', scan_claim(v_id, a) is null);
  update scans set handled_at = now() - interval '2 minutes' where id = v_id;
  perform pg_temp.ok(s, '… and can be claimed again once it''s gone quiet for a minute', scan_claim(v_id, a) is not null);

  -- Each scan is for the list it was sent to (0080).
  v_id := scan_send(a, ph, card);
  perform pg_temp.ok(s, 'A scan remembers the list it was sent to (0080)',
    (select target_kind = 'walk_in' and target_buy_id is null from scans where id = v_id));
  perform pg_temp.ok(s, '… another list doesn''t claim it', scan_claim(v_id, a, 'collection', gen_random_uuid()) is null);
  update scans set target_kind = 'collection', target_buy_id = gen_random_uuid() where id = v_id;
  perform pg_temp.ok(s, '… nor another collection, by name or as the screen''s open list',
    scan_claim(v_id, a, 'collection', gen_random_uuid()) is null and scan_claim(v_id, a) is null);
  update scans set target_kind = 'walk_in', target_buy_id = null where id = v_id;
  v := scan_claim(v_id, a, 'walk_in', null);
  perform pg_temp.ok(s, '… its own does', v ->> 'status' = 'pricing', v::text);

  update scan_sessions set heartbeat_at = now() - interval '2 minutes' where device_id = a;
  begin
    perform scan_send(a, ph, card);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Nothing is sent to a computer that''s gone quiet', sqlerrm, 'session_stale');
  end;
  perform scan_session_end(a);
  perform pg_temp.ok(s, 'Leaving the price screen keeps its scans waiting for their list (0080)',
    exists (select 1 from scans where session_device_id = a)
    and not exists (select 1 from scan_sessions where device_id = a));
  begin
    perform scan_send(a, ph, card);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and nothing more can be sent', sqlerrm, 'session_gone');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ The full review's B fixes (0084)
do $$
declare
  s text := 'Review B (0084)';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  ph uuid := gen_random_uuid();
  card jsonb := '{"scryfall_id": "dbtest-scan-9", "name": "DBTEST Bolt", "set_code": "DBT",
                  "collector_number": "9", "finish": "nonfoil", "condition": "NM", "tier": 1}';
  v_draft uuid;
  v_scan uuid;
  v_line uuid;
  v_other uuid;
  v_b uuid;
  v_at timestamptz;
  v jsonb;
begin
  -- 350: a walk-in scan is for the buy it was sent to; that buy confirmed, the scans left fail, saying so.
  insert into devices (id, label) values (ph, 'DBTEST Review Phone');
  v_draft := draft_for_device(a, u);
  perform draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u, true);
  perform scan_session_touch(a, 'walk_in', null, 'Buy list', '{mtg}', u, null);
  perform scan_pair(a, ph);
  v_scan := scan_send(a, ph, card);
  perform pg_temp.ok(s, 'A walk-in scan remembers the buy it was sent to (0084)',
    (select target_draft_id = v_draft from scans where id = v_scan));
  perform pg_temp.ok(s, '… another buy doesn''t claim it', scan_claim(v_scan, a, 'walk_in', null, gen_random_uuid()) is null);
  v := scan_claim(v_scan, a, 'walk_in', null, v_draft);
  perform pg_temp.ok(s, '… its own buy does', v ->> 'status' = 'pricing', v::text);
  perform confirm_buy(v_draft, u, 'DBTEST Review', '', 50, 65, null, 1, 'cash', '{}', '5550100017');
  perform pg_temp.ok(s, 'Its buy confirmed while it was being priced, the scan fails, saying so',
    (select status = 'failed' and note like 'Buy % was confirmed first: scan it again for the next buy' from scans where id = v_scan));
  begin
    perform draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u, true, v_draft);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a card scanned for it can''t start the next buy', sqlerrm, 'draft_gone');
  end;
  v_scan := scan_send(a, ph, card || '{"client_id": "2d7e4f0a-3b5c-4e8d-9f1a-4c3d5e6f7081"}');
  v_other := (select target_draft_id from scans where id = v_scan);
  perform pg_temp.ok(s, 'A scan with no buy open opens one for itself',
    v_other is not null and exists (select 1 from buys where id = v_other and status = 'draft'));
  perform draft_cancel(v_other);
  perform pg_temp.ok(s, 'Its buy cancelled, the scan fails, saying so',
    (select status = 'failed' and note = 'The buy was cancelled: scan it again for the next buy' from scans where id = v_scan));

  -- 351: a scanned copy merged into a line leaves its scan's id there.
  v_line := draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), u, true);
  v_other := draft_add_line(a, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00)
               || '{"price_snapshot": {"scan": {"scan_id": "dbtest-scan-merged"}}}', u, true);
  perform pg_temp.ok(s, 'A scanned copy merged into a line leaves its scan''s id there (0084)',
    v_other = v_line and (select price_snapshot -> 'scans' ? 'dbtest-scan-merged' and quantity = 2 from buy_lines where id = v_line));

  -- 352: two TCGplayer-only cards of one name from two sets are two lines.
  v_line := draft_add_line(a, (pg_temp.line('Dbtestmon', 'TPA', '5', 1, 2.00, 'pokemon') - 'tcgdex_id')
              || '{"tcgplayer_id": "900001"}', u, true);
  v_other := draft_add_line(a, (pg_temp.line('Dbtestmon', 'TPB', '5', 1, 2.00, 'pokemon') - 'tcgdex_id')
               || '{"tcgplayer_id": "900002"}', u, true);
  perform pg_temp.ok(s, 'Two TCGplayer-only cards of one name from two sets stay two lines (0084)', v_other <> v_line);
  v_other := draft_add_line(a, (pg_temp.line('Dbtestmon', 'TPA', '5', 1, 2.00, 'pokemon') - 'tcgdex_id')
               || '{"tcgplayer_id": "900001"}', u, true);
  perform pg_temp.ok(s, '… the same one twice is one line', v_other = v_line);

  -- 353: a walk-in's Completed side is locked, its bulk too.
  v_b := pg_temp.buy(a, u, 'DBTEST Locked Side', '5550100018', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.bulk('mtg_100_common', 10, 1.50)]);
  perform buy_mark_completed(v_b, 'mtg', u, a, true);
  v_line := (select id from buy_lines where buy_id = v_b and bulk_kind = 'mtg_100_common');
  begin
    perform buy_strike_line(v_line, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Completed side''s bulk can''t be struck (0084)', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_remove_line(v_line, 1, u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor removed', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_restore_line((select id from buy_lines where buy_id = v_b and game = 'mtg' and bulk_kind is null
                                and struck_at is not null limit 1), u, a, null, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… nor a card Mark as completed struck restored', sqlerrm, 'buy_completed');
  end;

  -- Bulk, a placeholder and a struck card never go out in an export (the review's B19).
  v_b := pg_temp.buy(a, u, 'DBTEST Mixed', '5550100019', array[pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00),
    pg_temp.bulk('mtg_100_common', 10, 1.50), pg_temp.bulk('mtg_placeholder', 1, 3.00) || '{"price_source": "manual"}']);
  perform buy_strike_line(pg_temp.line_id(v_b, 'Dbtest Bolt'), 1, u, a, null, null);
  v_line := (select id from buy_lines where buy_id = v_b and name = 'Dbtest Bolt' and struck_at is null);
  v := export_lines(jsonb_build_object('kind', 'buy', 'game', 'mtg', 'buy_id', v_b, 'version', pg_temp.version(v_b)),
         jsonb_build_array(pg_temp.match(v_line, 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
  perform pg_temp.ok(s, 'EXPORT sends the live card and leaves out bulk, a placeholder and a struck card',
    (v ->> 'cards')::integer = 1
    and not exists (select 1 from buy_lines where buy_id = v_b and (bulk_kind is not null or struck_at is not null)
                      and (cc_status is not null or completed_at is not null)), v::text);

  -- 354: a Settings save from an out-of-date screen is refused.
  v_at := (select updated_at from settings where key = 'cash_pct');
  perform settings_save('cash_pct', '51', u, v_at);
  begin
    perform settings_save('cash_pct', '52', u, v_at);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Settings save from an out-of-date screen is refused (0084)', sqlerrm, 'settings_changed');
  end;
  perform pg_temp.ok(s, '… the up-to-date one saved', master_pct('cash_pct') = 51);
  begin
    perform settings_save('dbtest_new_key', '1', u, now());
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and one expecting a setting that isn''t there', sqlerrm, 'settings_changed');
  end;
  perform settings_save('cash_pct', '50', u, (select updated_at from settings where key = 'cash_pct'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ The review leftovers (0004)
do $$
declare
  s text := 'Review leftovers (0004)';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  d date := date '2001-03-04';
  b uuid;
  c uuid;
  v_id uuid;
  v_other uuid;
  v_line uuid;
  v_req uuid := gen_random_uuid();
  v_n integer;
  v jsonb;
begin
  -- B19: the day's EXPORT and COMPLETE, not only Export single buy, leave out bulk, a placeholder
  -- and a struck card.
  perform pg_temp.ok(s, 'The test day (Mar 4, 2001) has no buys',
    not exists (select 1 from buys where kind = 'walk_in' and status = 'confirmed'
                 and (confirmed_at at time zone 'America/Los_Angeles')::date = d));
  b := pg_temp.buy(a, u, 'DBTEST Day Mixed', '5550100020', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 2, 1.00),
    pg_temp.bulk('mtg_100_common', 10, 1.50),
    pg_temp.bulk('mtg_placeholder', 1, 3.00) || '{"price_source": "manual"}',
    pg_temp.line('Dbtestchu', 'DBTP', '025', 2, 4.00, 'pokemon'),
    pg_temp.bulk('pkm_100', 10, 1.00),
    pg_temp.bulk('pkm_placeholder', 1, 2.00) || '{"price_source": "manual"}']);
  update buys set confirmed_at = (d + time '12:00') at time zone 'America/Los_Angeles' where id = b;
  perform buy_strike_line(pg_temp.line_id(b, 'Dbtest Bolt'), 1, u, a, null, null);
  perform buy_strike_line(pg_temp.line_id(b, 'Dbtestchu'), 1, u, a, null, null);
  v_line := (select id from buy_lines where buy_id = b and name = 'Dbtest Bolt' and struck_at is null);
  v := export_lines(jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg',
         'versions', jsonb_build_object(b::text, pg_temp.version(b))),
         jsonb_build_array(pg_temp.match(v_line, 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
  perform pg_temp.ok(s, 'The day''s EXPORT sends the live card and leaves out bulk, a placeholder and a struck card (B19)',
    (v ->> 'cards')::integer = 1 and (select cc_status = 'exported' from buy_lines where id = v_line)
    and not exists (select 1 from buy_lines where buy_id = b and game = 'mtg' and (bulk_kind is not null or struck_at is not null)
                      and (cc_status is not null or completed_at is not null)), v::text);
  v_line := (select id from buy_lines where buy_id = b and name = 'Dbtestchu' and struck_at is null);
  v_n := day_complete(d, 'pokemon', u, a, jsonb_build_array(jsonb_build_object('line_id', v_line, 'sell_price', 6.5,
           'sell_basis', '{"test": "dbtest"}'::jsonb)));
  perform pg_temp.ok(s, 'The day''s COMPLETE marks the live card and leaves out bulk, a placeholder and a struck card (B19)',
    v_n = 1 and (select completed_at is not null from buy_lines where id = v_line)
    and not exists (select 1 from buy_lines where buy_id = b and game = 'pokemon'
                      and (bulk_kind is not null or struck_at is not null) and completed_at is not null), v_n::text);

  -- 393 and 397: Convert leaves a Completed game whole; the new one remembers the buy that kept the payment.
  b := pg_temp.buy(a, u, 'DBTEST Whole Side', '5550100021', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.bulk('mtg_100_common', 10, 1.50),
    pg_temp.bulk('mtg_placeholder', 1, 3.00) || '{"price_source": "manual"}',
    pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  perform buy_mark_completed(b, 'mtg', u, a, true);
  c := buy_to_project(b, 'DBTEST Whole Side Project', u, a);
  perform pg_temp.ok(s, 'Convert to project leaves a Completed game whole on the buy, its bulk and placeholder too (0004)',
    (select count(*) from buy_lines where buy_id = b and game = 'mtg') = 3
    and (select count(*) from buy_lines where buy_id = c) = 1
    and exists (select 1 from buy_lines where buy_id = c and game = 'pokemon'));
  perform pg_temp.ok(s, '… and the project, paid $0, remembers the buy that kept the payment (0004)',
    (select kept_buy_id = b and paid_price = 0 from buys where id = c));
  b := pg_temp.buy(a, u, 'DBTEST Whole Side Two', '5550100022', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.bulk('mtg_100_common', 10, 1.50),
    pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon')]);
  perform buy_mark_completed(b, 'mtg', u, a, true);
  c := buy_to_collection(b, u, a);
  perform pg_temp.ok(s, '… Convert to collection too',
    (select count(*) from buy_lines where buy_id = b) = 2 and (select count(*) from buy_lines where buy_id = c) = 1
    and (select kept_buy_id from buys where id = c) = b);

  -- 388: a write pressed again after its answer was lost happens once.
  v_id := draft_add_line(a, pg_temp.line('Dbtest Once', 'DBT', '077', 1, 1.00), u, true, null, v_req);
  v_other := draft_add_line(a, pg_temp.line('Dbtest Once', 'DBT', '077', 1, 1.00), u, true, null, v_req);
  perform pg_temp.ok(s, 'ADD CARD pressed again after a lost answer adds once (0004)',
    v_other = v_id and (select quantity from buy_lines where id = v_id) = 1);
  perform draft_add_line(a, pg_temp.line('Dbtest Once', 'DBT', '077', 1, 1.00), u, true);
  perform pg_temp.ok(s, '… a new press adds again', (select quantity from buy_lines where id = v_id) = 2);
  v_req := gen_random_uuid();
  perform draft_remove_line(v_id, 1, u, v_req);
  perform draft_remove_line(v_id, 1, u, v_req);
  perform pg_temp.ok(s, '× pressed again after a lost answer takes one copy off (0004)',
    (select quantity from buy_lines where id = v_id) = 1);
  v_req := gen_random_uuid();
  c := collection_create('DBTEST Once', null, '', u, a, null, v_req);
  perform pg_temp.ok(s, 'Create pressed again makes one collection (0004)',
    collection_create('DBTEST Once', null, '', u, a, null, v_req) = c
    and (select count(*) from buys where customer_name = 'DBTEST Once') = 1);
  perform pg_temp.ok(s, 'The done requests aren''t open to the app (0004)',
    not has_table_privilege('authenticated', 'internal.done_requests', 'select, insert, update, delete')
    and not has_table_privilege('anon', 'internal.done_requests', 'select, insert, update, delete'));

  -- 391: an edit keeps the scans its line came from; lines folded together keep both.
  v_id := draft_add_line(a, pg_temp.line('Dbtest Scanned', 'DBT', '078', 1, 1.00)
            || '{"price_snapshot": {"scan": {"scan_id": "dbtest-scan-a"}}}', u, true);
  v_other := draft_add_line(a, pg_temp.line('Dbtest Scanned', 'DBT', '079', 1, 1.00)
               || '{"price_snapshot": {"scan": {"scan_id": "dbtest-scan-b"}}}', u, true);
  v_line := draft_update_line(v_other, pg_temp.line('Dbtest Scanned', 'DBT', '078', 1, 1.00), u);
  perform pg_temp.ok(s, 'Lines an edit folds together keep both lines'' scans (0004)',
    v_line = v_id and (select quantity = 2 and internal.scan_ids(price_snapshot) @> '["dbtest-scan-a", "dbtest-scan-b"]'
                         from buy_lines where id = v_id),
    (select price_snapshot::text from buy_lines where id = v_id));
  v_line := draft_update_line(v_id, pg_temp.line('Dbtest Scanned', 'DBT', '078', 2, 1.00, p_cond => 'LP'), u);
  perform pg_temp.ok(s, '… and an edit keeps them',
    (select internal.scan_ids(price_snapshot) @> '["dbtest-scan-a", "dbtest-scan-b"]' from buy_lines where id = v_line));

  -- 394: a new key's first save, once. Two at the same moment need two sessions, which this run
  -- can't make; this checks the new path's answer one after the other: the second is refused.
  perform settings_save('dbtest_first_key', '1', u, null);
  begin
    perform settings_save('dbtest_first_key', '2', u, null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A second first save of a new Settings key is refused (0004)', sqlerrm, 'settings_changed');
  end;

  -- 398: the restore dialog's columns.
  perform pg_temp.ok(s, 'The database lists its backup tables'' columns for the restore dialog (0004)',
    (backup_columns() -> 'buys') ? 'kept_buy_id' and (backup_columns() -> 'buy_lines') ? 'price_snapshot');
  -- The cards added here to this computer's walk-in draft go, so the next block's buy starts empty.
  perform draft_cancel(draft_for_device(a, u));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ========================================== Bulk pulled from exports (0005)
do $$
declare
  s text := 'Pulled bulk (0005)';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  d date := date '2001-04-05';
  b uuid;
  v_big uuid;
  v_small uuid;
  v_sys uuid;
  v jsonb;
  v_target jsonb;
begin
  perform pg_temp.ok(s, 'The test day (Apr 5, 2001) has no buys',
    not exists (select 1 from buys where kind = 'walk_in' and status = 'confirmed'
                 and (confirmed_at at time zone 'America/Los_Angeles')::date = d));
  b := pg_temp.buy(a, u, 'DBTEST Pulled', '5550100023', array[
    pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), pg_temp.line('Dbtest Counterspell', 'DBT', '002', 2, 0.10)]);
  update buys set confirmed_at = (d + time '12:00') at time zone 'America/Los_Angeles' where id = b;
  v_big := pg_temp.line_id(b, 'Dbtest Bolt');
  v_small := pg_temp.line_id(b, 'Dbtest Counterspell');
  v_target := jsonb_build_object('kind', 'day', 'day', d, 'game', 'mtg', 'versions', jsonb_build_object(b::text, pg_temp.version(b)));
  begin
    perform export_lines(v_target, jsonb_build_array(pg_temp.match(v_big, 'DBTEST-P1', 1.25)), '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'An export takes every card: matched, can''t upload or pulled', sqlerrm, 'stale_version');
  end;
  v := export_lines(v_target, jsonb_build_array(pg_temp.match(v_big, 'DBTEST-P1', 1.25)), '{}', '[]', u, a, array[v_small]);
  v_sys := (select id from buys where system_key = 'pulled');
  perform pg_temp.ok(s, 'Export (>$1) pulls a card: stamped Pulled and Completed, not in the file (0005)',
    (v ->> 'cards')::integer = 1 and (v ->> 'pulled')::integer = 2
    and (select cc_status = 'pulled' and completed_at is not null and cc_custom_sku is null from buy_lines where id = v_small)
    and not exists (select 1 from jsonb_array_elements(v -> 'lines') x where x ->> 'id' = v_small::text and x ->> 'cc_status' = 'exported'),
    v::text);
  perform pg_temp.ok(s, '… copied to Bulk pulled from exports, made for it, saying which buy',
    v_sys is not null and (select system_key from buys where id = v_sys) = 'pulled'
    and exists (select 1 from buy_lines where buy_id = v_sys and source_line_id = v_small and quantity = 2 and source_note like 'from Buy %'));
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where action = 'day_exported' and day = d
              and summary like '%2 under $1 pulled, copied to Bulk pulled from exports%')
    and exists (select 1 from events where action = 'pulled_added' and target_id = v_sys));

  -- Undo export brings it back, its copy out of the collection.
  perform export_undo_day(d, 'mtg', u, a);
  perform pg_temp.ok(s, 'Undo export takes a pulled card back too, its copy out of Bulk pulled from exports (0005)',
    (select cc_status is null and completed_at is null from buy_lines where id = v_small)
    and not exists (select 1 from buy_lines where buy_id = v_sys and source_line_id = v_small)
    and exists (select 1 from events where action = 'pulled_returned' and target_id = v_sys));

  -- Pulled again, then exported from the collection: the original is exported now.
  v_target := jsonb_set(v_target, '{versions}', jsonb_build_object(b::text, pg_temp.version(b)));
  perform export_lines(v_target, jsonb_build_array(pg_temp.match(v_big, 'DBTEST-P1', 1.25)), '{}', '[]', u, a, array[v_small]);
  begin
    perform export_lines(jsonb_build_object('kind', 'pulled', 'version', pg_temp.version(v_sys)), '[]', '{}', '[]', u, a, array[v_small]);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'The pulled collection''s own export pulls nothing', sqlerrm, 'bad_target');
  end;
  -- Its own export, as Can't upload cards': this computer holds it, and any other cards already
  -- there (dev's own) stay as not matched.
  perform lock_acquire(v_sys, a, u, true);
  v := export_lines(jsonb_build_object('kind', 'pulled', 'version', pg_temp.version(v_sys)),
         jsonb_build_array(pg_temp.match((select id from buy_lines where buy_id = v_sys and source_line_id = v_small), 'DBTEST-P3', 0.40)),
         array(select id from buy_lines where buy_id = v_sys and game = 'mtg' and bulk_kind is null and struck_at is null
                 and source_line_id is distinct from v_small), '[]', u, a);
  perform pg_temp.ok(s, 'Bulk pulled from exports exports its cards: they leave, the original is exported now (0005)',
    (v ->> 'cards')::integer = 2
    and (select cc_status = 'exported' and cc_product_id = 'DBTEST-P3' from buy_lines where id = v_small)
    and not exists (select 1 from buy_lines where buy_id = v_sys and source_line_id = v_small)
    and exists (select 1 from events where action = 'pulled_exported' and target_id = v_sys), v::text);
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ============================================ Settings in the Changelog (0006)
do $$
declare
  s text := 'Settings logged (0006)';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  v_at timestamptz;
begin
  v_at := (select updated_at from settings where key = 'cash_pct');
  begin
    perform settings_save('cash_pct', '51', null, v_at);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Settings save needs a user (0006)', sqlerrm, 'no_user');
  end;
  perform settings_save('cash_pct', '51', u, v_at, a, 'Master Buy Percentages: Cash 50% → 51%.');
  perform pg_temp.ok(s, '… and goes in the Changelog under Actions, saying what changed (0006)',
    exists (select 1 from events where action = 'setting_changed' and kind = 'app' and staff_user_id = u and device_id = a
              and target_name = 'Master Buy Percentages' and summary = 'Master Buy Percentages: Cash 50% → 51%.'
              and fields = '[]'::jsonb));
  perform settings_save('dbtest_tiers', '{"low": 1, "high": 2}', u, null, a, repeat('x', 400));
  perform pg_temp.ok(s, '… a setting with no name of its own keeps its key, and a long sentence is cut at 300',
    exists (select 1 from events where action = 'setting_changed' and target_name = 'dbtest_tiers'
              and length(summary) = 300));
  perform settings_save('cash_pct', '50', u, (select updated_at from settings where key = 'cash_pct'), a, null);
  begin
    perform settings_log(u, a, 'something_else', 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'settings_log takes only its own actions', sqlerrm, 'bad_action');
  end;
  begin
    perform settings_log(null, a, 'cc_match_forgotten', 'x');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with a user', sqlerrm, 'no_user');
  end;
  perform settings_log(u, a, 'justtcg_key_saved', 'JustTCG key saved.');
  perform pg_temp.ok(s, 'A JustTCG key saved goes in the Changelog, without the key (0006)',
    exists (select 1 from events where action = 'justtcg_key_saved' and staff_user_id = u and summary = 'JustTCG key saved.'));
  begin
    perform master_inventory_start('dbtest/none.csv.gz', 'none.csv', 1, 1, array['x'], null);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Master Crystal Inventory upload needs a user (0006)', sqlerrm, 'no_user');
  end;
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

-- ======================================================= Backup and restore
-- The restore resets the Changelog's numbering; it's set back after.
reset role;
select pg_temp.put('events_seq_before_restore', (select last_value::text from events_seq_seq));
set local role authenticated;

do $$
declare
  s text := 'Backup';
  u uuid := pg_temp.id('u1');
  a uuid := pg_temp.id('devA');
  v_counts jsonb;
  v_payload jsonb;
  v_after uuid;
  v_res jsonb;
begin
  v_counts := backup_counts();
  perform pg_temp.ok(s, 'Backup counts match the tables',
    (v_counts ->> 'buys')::integer = (select count(*) from buys where kind = 'walk_in' and status = 'confirmed')
    and (v_counts ->> 'collections')::integer = (select count(*) from buys where kind = 'collection')
    and (v_counts ->> 'lines')::integer = (select count(*) from buy_lines)
    and (v_counts ->> 'events')::integer = (select count(*) from events)
    and (v_counts ->> 'users')::integer = (select count(*) from staff_users where active), v_counts::text);
  v_payload := backup_export();
  perform pg_temp.ok(s, 'A backup has its nine tables, the learned matches too (0082), and nothing secret',
    (select array_agg(k order by k) from jsonb_object_keys(v_payload -> 'tables') k)
      = array['buy_lines', 'buys', 'cc_product_links', 'cc_set_map', 'devices', 'events', 'import_links',
              'settings', 'staff_users']
    and v_payload ->> 'format' = 'pug-pricing-backup' and (v_payload ->> 'version') = '1'
    and position('sb_secret' in v_payload::text) = 0);
  perform pg_temp.ok(s, '… all of them',
    jsonb_array_length(v_payload -> 'tables' -> 'buy_lines') = (v_counts ->> 'lines')::integer
    and jsonb_array_length(v_payload -> 'tables' -> 'events') = (v_counts ->> 'events')::integer
    and jsonb_array_length(v_payload -> 'tables' -> 'buys') = (select count(*) from buys));
  begin
    perform restore_backup(v_payload, 'dbtest-backup.json', u, a, 'restore');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Restore needs RESTORE typed', sqlerrm, 'not_confirmed');
  end;
  begin
    perform restore_backup('{"format": "something else", "version": 1, "tables": {}}', 'x.json', u, a, 'RESTORE');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… and a backup file of this app''s', sqlerrm, 'bad_backup');
  end;
  begin
    perform restore_backup(v_payload #- '{tables,events}', 'x.json', u, a, 'RESTORE');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… with all its tables', sqlerrm, 'bad_backup');
  end;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform restore_backup(v_payload, 'x.json', u, a, 'RESTORE');
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… signed in', sqlerrm, 'not_signed_in');
  end;
  perform set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-8000-00000000d0b7","role":"authenticated"}', true);

  -- A backup from before a column was added (no `project` on its buys, no learned matches):
  -- the column takes its default, the learned matches stay as they are (0082).
  v_res := restore_backup(jsonb_set(v_payload #- '{tables,cc_set_map}' #- '{tables,cc_product_links}' #- '{tables,import_links}',
             '{tables,buys}', (select jsonb_agg(b - 'project') from jsonb_array_elements(v_payload -> 'tables' -> 'buys') b)),
           'dbtest-old-backup.json', u, a, 'RESTORE');
  perform pg_temp.ok(s, 'An older backup restores: a column it lacks takes its default (0082)',
    (v_res ->> 'lines') = (v_counts ->> 'lines') and not exists (select 1 from buys where project));
  perform pg_temp.ok(s, '… and leaves the learned matches as they are',
    exists (select 1 from cc_set_map where scryfall_set = 'dbt' and category = 'DBTEST Set'));
  -- A file whose list of them is there but empty leaves them as they are too (0004).
  v_res := restore_backup(jsonb_set(v_payload, '{tables,cc_set_map}', '[]'), 'dbtest-empty-matches.json', u, a, 'RESTORE');
  perform pg_temp.ok(s, 'An empty list of set choices in the file leaves the ones here (0004)',
    exists (select 1 from cc_set_map where scryfall_set = 'dbt' and category = 'DBTEST Set'));

  -- Something made after the backup, for the restore to undo.
  v_after := collection_create('DBTEST After Backup', null, '', u, a);
  delete from cc_set_map where scryfall_set = 'dbt';
  v_res := restore_backup(v_payload, 'dbtest-backup.json', u, a, 'RESTORE');
  perform pg_temp.ok(s, 'Restore puts everything back as it was, plus its own Changelog entry',
    v_res ->> 'buys' = v_counts ->> 'buys' and v_res ->> 'collections' = v_counts ->> 'collections'
    and v_res ->> 'lines' = v_counts ->> 'lines' and v_res ->> 'users' = v_counts ->> 'users'
    and (v_res ->> 'events')::integer = (v_counts ->> 'events')::integer + 1,
    v_counts::text || ' → ' || v_res::text);
  perform pg_temp.ok(s, '… drops what came after the backup', not exists (select 1 from buys where id = v_after));
  perform pg_temp.ok(s, '… brings back the learned matches (0082)',
    exists (select 1 from cc_set_map where scryfall_set = 'dbt' and category = 'DBTEST Set'));
  perform pg_temp.ok(s, '… and brings back the run''s own buys and cards',
    (select count(*) from buy_lines where buy_id = pg_temp.id('buy1')) = 2);
  perform pg_temp.ok(s, 'The restore is in the Changelog',
    exists (select 1 from events where action = 'backup_restored' and target_name = 'dbtest-backup.json'
              and summary = 'Backup restored — dbtest-backup.json' and staff_user_id = u));
  perform pg_temp.ok(s, 'Settings come back', master_pct('cash_pct') = 50 and master_pct('credit_pct') = 65);
  perform pg_temp.ok(s, 'Past customers are rebuilt from the buys',
    exists (select 1 from customers where name_key = 'dbtest ash' and phone = '5550100001'));
exception when others then
  declare v_ctx text; begin get stacked diagnostics v_ctx = pg_exception_context;
  perform pg_temp.crashed(s, sqlerrm, v_ctx); end;
end $$;

reset role;
-- Sequences don't roll back: the Changelog's numbering goes back to where it
-- was (or wherever it's got to since), never lower.
select setval('events_seq_seq', greatest((select v::bigint from pg_temp.dbt_ctx where k = 'events_seq_before_restore'),
                                         (select last_value from events_seq_seq)));
set local role authenticated;

-- ================================================================ results
reset role;
select n, section, name, ok, detail from pg_temp.dbt order by n;

rollback;
