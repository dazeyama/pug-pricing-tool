-- PUG Pricing Tool: the database test run (TEST.md, section 18).
--
-- Calls every server function the app uses, as the app's own signed-in role
-- (authenticated), and checks what each one does and what it refuses. It all
-- runs in ONE transaction that is rolled back at the end, so nothing it makes
-- is kept: no buys, collections, users, computers, inventory or settings.
-- (The only trace: the Changelog's numbering skips the numbers its entries
-- used.) It also prints fingerprints of the database's structure, so a run on
-- prod after the migration squash can be compared with a run on dev.
--
-- Run it with scripts/db-test-run.mjs, which checks which project is linked,
-- prints the results and checks that nothing was left behind:
--   node scripts/db-test-run.mjs
--
-- While it runs (a few seconds) the restore test holds its tables, so another
-- computer saving something waits until it's done: run it when the store
-- isn't using the app. It reads no secrets and prints no customer data: every
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

grant execute on function pg_temp.ok(text, text, boolean, text), pg_temp.err(text, text, text, text),
  pg_temp.crashed(text, text, text), pg_temp.put(text, text), pg_temp.id(text), pg_temp.version(uuid),
  pg_temp.line(text, text, text, integer, numeric, text, text, text),
  pg_temp.buy(uuid, uuid, text, text, jsonb[]), pg_temp.line_id(uuid, text, text),
  pg_temp.match(uuid, text, numeric, text) to public;


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
          select format('schema %s %s', nspname, nspacl) from pg_namespace where nspname in ('public', 'internal')) x;
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

  select string_agg(p.proname, ', ' order by p.proname) into v
    from pg_proc p where p.pronamespace = 'public'::regnamespace
     and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  perform pg_temp.ok(s, 'The app can run every public function but restore_rows', v = 'restore_rows', v);

  select string_agg(ns.nspname || '.' || p.proname, ', ' order by ns.nspname || '.' || p.proname) into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname in ('public', 'internal') and p.prosecdef;
  perform pg_temp.ok(s, 'Only the expected functions run with the owner''s rights',
    v = 'internal.remember_customer, public.cc_products_load, public.master_inventory_abort, '
        || 'public.master_inventory_finish, public.restore_backup', v);

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
  select count(*) into v_n from buys x
   where x.status = 'confirmed'
     and (x.confirmed_at at time zone 'America/Los_Angeles')::date = (now() at time zone 'America/Los_Angeles')::date
     and exists (select 1 from buy_lines l where l.buy_id = x.id and l.game = 'mtg');
  perform pg_temp.ok(s, 'It answers with its number on today''s page',
    (v_res ->> 'number')::integer = v_n and v_res -> 'games' = '["mtg", "pokemon"]'::jsonb
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
  perform pg_temp.ok(s, 'Mark as completed (Magic) completes just the Magic cards',
    v_n = 1 and (select completed_at is not null from buy_lines where id = l1)
    and (select completed_at is null from buy_lines where id = lp));
  perform pg_temp.ok(s, 'The calendar sees it',
    (select games = array['mtg', 'pokemon'] and completed_games = array['mtg'] and exported_games = '{}'
       from buys_in_range(now() - interval '1 minute', now() + interval '1 minute') where id = b));
  perform pg_temp.ok(s, 'The everyday search leaves completed cards out; the full one shows them',
    not exists (select 1 from global_search('dbtest bolt', null, null, null, false) where line_id = l1)
    and exists (select 1 from global_search('dbtest bolt', null, null, null, true) where line_id = l1 and completed));
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
  begin
    perform buy_to_project(b, 'DBTEST X', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… or made a project', sqlerrm, 'buy_completed');
  end;
  begin
    perform buy_mark_completed(b, 'chess', u, a, true);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'Only Magic or Pokémon', sqlerrm, 'bad_game');
  end;
  perform pg_temp.ok(s, 'Completing twice changes nothing', buy_mark_completed(b, 'mtg', u, a, true) = 0);
  v_n := buy_mark_completed(b, 'mtg', u, a, false);
  perform pg_temp.ok(s, 'Paid/Ours again puts it back', v_n = 1 and (select completed_at is null from buy_lines where id = l1));

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
  perform pg_temp.ok(s, 'A buy''s custom rates win over the master ones',
    (select cash_pct = 40 and credit_pct = 60 from buys where id = v_b));

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
            and phone = '5550100003' and paid_price = 3 and paid_method = 'cash' and cash_pct = 40
            and credit_pct = 60 and created_by = u from buys where id = v_p));
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

  -- A project's custom rates stay custom.
  v_r := project_create('DBTEST Rates', '', u, a);
  perform lock_acquire(v_r, a, u);
  perform collection_add_line(v_r, pg_temp.line('Dbtest Bolt', 'DBT', '001', 1, 1.00), true, u, a, null, null);
  perform collection_update_info(v_r, '{"custom_cash_pct": 45, "custom_credit_pct": 55}', u, a, null);
  v_res := project_to_buy(v_r, u, a, 'DBTEST Gary', '5550100004', 1, 'cash', '', 50, 65);
  perform pg_temp.ok(s, 'A project''s custom rates stay custom on the buy (its own lock is no bar)',
    (select cash_pct = 45 and credit_pct = 55 and custom_cash_pct = 45 and custom_credit_pct = 55
       from buys where id = (v_res ->> 'id')::uuid));
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
  exception when others then perform pg_temp.err(s, 'Only EXPORT marks a collection Completed', sqlerrm, 'complete_by_export');
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
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
  v_sku text := internal.cc_custom_sku(now());
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
             where x.system_key = 'cant_upload' and c.source_line_id = mys and c.source_note = 'from Buy 2 · February 3, 2001'),
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
              and summary = '2 Magic buys marked Paid/Ours again; 1 card taken back out of Can''t upload cards.'));
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
                  and summary = '2 Magic cards marked Paid/Ours again; 1 card taken back out of Can''t upload cards.'));
  perform pg_temp.ok(s, '… leaving the rest of the day exported', (select cc_status = 'exported' from buy_lines where id = bolt));
  perform pg_temp.ok(s, 'Nothing left to undo changes nothing', buy_unexport(b2, 'mtg', u, a) = 0);
  begin
    perform buy_unexport(b2, 'chess', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… Magic or Pokémon only', sqlerrm, 'bad_game');
  end;

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
    exists (select 1 from buy_lines where source_line_id = mys and source_note = 'from Buy 2 · Sat Feb 3, 2001'),
    (select source_note from buy_lines where source_line_id = mys));
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where action = 'buy_exported' and target_id = b2
              and summary = format('1 Magic card exported on its own (Custom SKU %s); 1 can''t upload, copied to Can''t upload cards; the buy is Completed.', v_sku)));
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
  v_pp uuid;
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
  perform pg_temp.ok(s, 'EXPORT completes a Paid/Ours collection, its Magic cards stamped',
    (v ->> 'cards')::integer = 3 and v ->> 'sku' = v_sku
    and (select status = 'completed' and completed_at is not null from buys where id = v_c)
    and (select cc_status = 'exported' from buy_lines where id = c1)
    and (select cc_status is null from buy_lines where id = cp), v::text);
  perform pg_temp.ok(s, '… and the Changelog says so',
    exists (select 1 from events where target_id = v_c and action = 'collection_status_changed'
              and summary = format('Exported 3 cards (Custom SKU %s); marked Completed.', v_sku)));
  begin
    perform export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)), '[]', '{}', '[]', u, a);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, '… only once', sqlerrm, 'nothing_to_export');
  end;
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
  perform pg_temp.ok(s, 'Reopening a Completed collection undoes its export',
    (select status = 'paid' and completed_at is null from buys where id = v_c)
    and (select cc_status is null and cc_custom_sku is null from buy_lines where id = c1)
    and exists (select 1 from events where target_id = v_c
                  and summary = 'Reopened: back to Paid/Ours, still locked. Its export was undone.'));
  v := export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_c, 'version', pg_temp.version(v_c)), '[]', array[c1], '[]', u, a);
  perform pg_temp.ok(s, 'A collection''s card that can''t upload is copied, saying where from',
    (v ->> 'cant')::integer = 3 and v ->> 'sku' is null
    and exists (select 1 from buy_lines where source_line_id = c1 and source_note = 'from DBTEST Collection Two'));
  perform collection_set_status(v_c, 'paid', u, a, null, null, null);
  perform pg_temp.ok(s, '… and reopening takes it back out',
    not exists (select 1 from buy_lines where source_line_id = c1)
    and exists (select 1 from events where target_id = v_c
                  and summary = 'Reopened: back to Paid/Ours, still locked. Its export was undone: 3 cards taken back out of Can''t upload cards.'));

  v_pp := project_create('DBTEST Pokémon Project', '', u, a);
  perform lock_acquire(v_pp, a, u);
  perform collection_add_line(v_pp, pg_temp.line('Dbtestchu', 'DBTP', '025', 1, 4.00, 'pokemon'), true, u, a, null, null);
  v := export_lines(jsonb_build_object('kind', 'collection', 'buy_id', v_pp, 'version', pg_temp.version(v_pp)), '[]', '{}', '[]', u, a);
  perform pg_temp.ok(s, 'A project of only Pokémon cards is Completed with no file',
    (v ->> 'cards')::integer = 0 and v ->> 'sku' is null and (select status = 'completed' from buys where id = v_pp)
    and exists (select 1 from events where target_id = v_pp and summary = 'Marked Completed: no Magic cards to export.'));
  begin
    perform project_to_buy(v_pp, u, a, 'DBTEST Gary', '5550100004', 1, 'cash', '', 50, 65);
    raise exception 'dbt_no_error';
  exception when others then perform pg_temp.err(s, 'A Completed project can''t be converted to a buy', sqlerrm, 'project_completed');
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
  perform pg_temp.ok(s, 'A backup has its six tables, and nothing secret',
    (select array_agg(k order by k) from jsonb_object_keys(v_payload -> 'tables') k)
      = array['buy_lines', 'buys', 'devices', 'events', 'settings', 'staff_users']
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

  -- Something made after the backup, for the restore to undo.
  v_after := collection_create('DBTEST After Backup', null, '', u, a);
  v_res := restore_backup(v_payload, 'dbtest-backup.json', u, a, 'RESTORE');
  perform pg_temp.ok(s, 'Restore puts everything back as it was, plus its own Changelog entry',
    v_res ->> 'buys' = v_counts ->> 'buys' and v_res ->> 'collections' = v_counts ->> 'collections'
    and v_res ->> 'lines' = v_counts ->> 'lines' and v_res ->> 'users' = v_counts ->> 'users'
    and (v_res ->> 'events')::integer = (v_counts ->> 'events')::integer + 1,
    v_counts::text || ' → ' || v_res::text);
  perform pg_temp.ok(s, '… drops what came after the backup', not exists (select 1 from buys where id = v_after));
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
