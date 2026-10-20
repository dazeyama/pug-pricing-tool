-- PUG Pricing Tool: the database as one migration (DESIGN_SPEC decision 192,
-- Phase 10 "Migration squash at launch"). Written 2026-10-19 by
-- scripts/db-baseline.mjs from the dev project's catalog (psucrzljraxeootwnltf), standing in
-- for migrations 0001–0084, now in supabase/migrations-archive/.
-- Nothing here is edited by hand except the "Starting rows" at the end; to change
-- the database, write migration 0002 and up.

-- Function bodies aren't checked as they're created, so their order doesn't
-- matter (pg_dump does the same).
set check_function_bodies = off;


-- ==========================================================================
-- Extensions
-- ==========================================================================
create extension if not exists pg_trgm with schema extensions;

-- ==========================================================================
-- Schemas
-- ==========================================================================
create schema if not exists internal;

-- ==========================================================================
-- Sequences
-- ==========================================================================
create sequence public.buys_number_seq as integer increment by 1 minvalue 1 maxvalue 2147483647 start with 1 no cycle;
create sequence public.events_seq_seq as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807 start with 1 no cycle;

-- ==========================================================================
-- Tables (columns; defaults come after the functions they may call)
-- ==========================================================================
create table public.api_usage (
  id integer not null,
  plan text,
  daily_used integer,
  daily_limit integer,
  monthly_used integer,
  monthly_limit integer,
  rate_limit integer,
  updated_at timestamp with time zone not null
);
create table public.buy_lines (
  id uuid not null,
  buy_id uuid not null,
  position integer not null,
  game text not null,
  lang text not null,
  name text not null,
  name_key text not null,
  set_code text not null,
  set_name text,
  source_set_id text,
  collector_number text not null,
  printed_size integer,
  rarity text,
  finish text not null,
  first_edition boolean not null,
  treatments jsonb not null,
  condition text not null,
  quantity integer not null,
  unit_price numeric(10,2) not null,
  market_price numeric(10,2),
  price_source text not null,
  price_snapshot jsonb,
  priced_at timestamp with time zone,
  scryfall_id text,
  oracle_id text,
  tcgdex_id text,
  tcgplayer_id text,
  justtcg_card_id text,
  justtcg_variant_id text,
  image_url text,
  created_at timestamp with time zone not null,
  name_en text,
  completed_at timestamp with time zone,
  completed_by uuid,
  cc_status text,
  cc_product_id text,
  cc_product_name text,
  cc_category text,
  cc_condition text,
  cc_sell_price numeric(10,2),
  cc_sell_basis jsonb,
  cc_custom_sku text,
  cc_exported_at timestamp with time zone,
  source_line_id uuid,
  source_note text,
  custom_cash_pct numeric(5,2),
  custom_credit_pct numeric(5,2),
  cash_pct numeric(5,2),
  credit_pct numeric(5,2),
  bulk_kind text,
  struck_at timestamp with time zone,
  struck_by uuid
);
create table public.buys (
  id uuid not null,
  kind text not null,
  status text not null,
  customer_name text,
  phone text,
  notes text not null,
  draft_device_id uuid,
  created_at timestamp with time zone not null,
  created_by uuid,
  updated_at timestamp with time zone not null,
  last_edited_by uuid,
  confirmed_at timestamp with time zone,
  confirmed_by uuid,
  paid_at timestamp with time zone,
  cash_pct numeric(5,2),
  credit_pct numeric(5,2),
  version integer not null,
  custom_cash_pct numeric(5,2),
  custom_credit_pct numeric(5,2),
  id_last4 text,
  offer_cash numeric(10,2),
  offer_credit numeric(10,2),
  paid_price numeric(10,2),
  paid_method text,
  completed_at timestamp with time zone,
  system_key text,
  project boolean not null,
  rejected_at timestamp with time zone,
  rejected_reason text,
  condition_check boolean not null,
  condition_checked_at timestamp with time zone,
  condition_checked_by uuid,
  number integer
);
create table public.cc_product_links (
  scryfall_id text not null,
  finish text not null,
  product_id text not null,
  product_name text not null,
  category text not null,
  source text not null,
  linked_at timestamp with time zone not null,
  linked_by uuid
);
create table public.cc_products (
  file_id uuid not null,
  product_id text not null,
  cc_id text,
  product_name text not null,
  category text not null,
  base_key text not null,
  bracket text,
  foil_kind text,
  variants text[] not null,
  catalog_path text not null
);
create table public.cc_set_map (
  scryfall_set text not null,
  promo_kind text not null,
  category text not null,
  source text not null,
  updated_at timestamp with time zone not null,
  updated_by uuid
);
create table public.collection_locks (
  buy_id uuid not null,
  device_id uuid not null,
  staff_user_id uuid,
  acquired_at timestamp with time zone not null,
  heartbeat_at timestamp with time zone not null
);
create table public.customers (
  name_key text not null,
  name text not null,
  phone text,
  last_used timestamp with time zone not null
);
create table public.devices (
  id uuid not null,
  label text not null,
  last_seen_at timestamp with time zone not null
);
create table public.events (
  seq bigint not null,
  at timestamp with time zone not null,
  staff_user_id uuid,
  staff_user_name text,
  staff_user_color text,
  device_id uuid,
  kind text not null,
  action text not null,
  target_id uuid,
  target_name text,
  games text[] not null,
  added integer not null,
  removed integer not null,
  totals jsonb,
  lines jsonb not null,
  fields jsonb not null,
  summary text not null,
  search_text text generated always as (translate(lower(((((((COALESCE(target_name, ''::text) || ' '::text) || COALESCE(summary, ''::text)) || ' '::text) || (lines)::text) || ' '::text) || (fields)::text)), 'áàâäãåéèêëíìîïóòôöõúùûüñçœæ'::text, 'aaaaaaeeeeiiiiooooouuuuncoa'::text)) stored,
  search_digits text generated always as (regexp_replace(((COALESCE(summary, ''::text) || ' '::text) || (fields)::text), '[^0-9]'::text, ''::text, 'g'::text)) stored,
  day date
);
create table public.import_links (
  key text not null,
  category text not null,
  product_name text not null,
  scryfall_id text not null,
  finish text not null,
  linked_at timestamp with time zone not null,
  linked_by uuid
);
create table public.master_inventory_files (
  id uuid not null,
  storage_path text not null,
  original_filename text not null,
  size_bytes integer not null,
  row_count integer not null,
  columns text[] not null,
  uploaded_at timestamp with time zone not null,
  uploaded_by uuid,
  is_current boolean not null,
  products_loaded integer
);
create table public.price_cache (
  key text not null,
  game text not null,
  payload jsonb not null,
  fetched_at timestamp with time zone not null
);
create table public.price_map (
  source_key text not null,
  justtcg_card_id text,
  resolved_at timestamp with time zone not null
);
create table public.scan_sessions (
  device_id uuid not null,
  target_kind text not null,
  buy_id uuid,
  target_name text not null,
  games text[] not null,
  staff_user_id uuid,
  locked text,
  can_add boolean generated always as (((staff_user_id IS NOT NULL) AND (locked IS NULL) AND ('mtg'::text = ANY (games)))) stored,
  heartbeat_at timestamp with time zone not null,
  phone_device_id uuid,
  paired_at timestamp with time zone,
  phone_seen_at timestamp with time zone,
  scanned integer not null
);
create table public.scans (
  id uuid not null,
  session_device_id uuid not null,
  phone_device_id uuid not null,
  scryfall_id text not null,
  name text not null,
  set_code text not null,
  collector_number text not null,
  finish text not null,
  condition text not null,
  tier smallint not null,
  manual_price numeric(10,2),
  status text not null,
  line_id uuid,
  line_qty integer,
  price numeric(10,2),
  price_source text,
  note text,
  created_at timestamp with time zone not null,
  handled_at timestamp with time zone,
  client_id uuid,
  target_kind text,
  target_buy_id uuid,
  target_draft_id uuid
);
create table public.secrets (
  provider text not null,
  value text not null,
  updated_at timestamp with time zone not null
);
create table public.settings (
  key text not null,
  value jsonb not null,
  updated_at timestamp with time zone not null,
  updated_by uuid
);
create table public.staff_users (
  id uuid not null,
  name text not null,
  color text not null,
  active boolean not null,
  created_at timestamp with time zone not null
);
alter sequence public.events_seq_seq owned by public.events.seq;

-- ==========================================================================
-- Functions (114: 80 public, 34 internal)
-- ==========================================================================
CREATE OR REPLACE FUNCTION internal.remember_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_name text := internal.customer_name(new.customer_name);
  v_phone text := case when new.phone ~ '^[0-9]{10}$' then new.phone end;
  v_at timestamptz;
begin
  if v_name = '' then return new; end if;
  if new.kind = 'walk_in' and new.status is distinct from 'confirmed' then return new; end if;
  if new.kind = 'collection' and (new.project or new.system_key is not null) then return new; end if;
  if new.kind not in ('walk_in', 'collection') then return new; end if;
  -- An update only counts when it records the customer: a walk-in being
  -- confirmed, or a name or phone changed (not a collection's status alone).
  if tg_op = 'UPDATE'
     and new.customer_name is not distinct from old.customer_name
     and new.phone is not distinct from old.phone
     and not (new.kind = 'walk_in' and old.status is distinct from 'confirmed') then
    return new;
  end if;
  v_at := case when tg_op = 'UPDATE' then now()
               else coalesce(new.confirmed_at, new.updated_at, new.created_at, now()) end;
  -- A collection renamed with its phone untouched records the name only.
  if tg_op = 'UPDATE' and new.kind = 'collection' and new.phone is not distinct from old.phone then
    v_phone := null;
  end if;
  begin
    insert into customers as c (name_key, name, phone, last_used)
    values (lower(v_name), v_name, v_phone, v_at)
    on conflict (name_key) do update set
      name      = case when excluded.last_used >= c.last_used then excluded.name else c.name end,
      phone     = case when excluded.phone is not null and (c.phone is null or excluded.last_used >= c.last_used)
                       then excluded.phone else c.phone end,
      last_used = greatest(c.last_used, excluded.last_used);
  exception when others then
    raise warning 'remember_customer skipped: %', sqlerrm;
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.bulk_per(p_kind text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p_kind
    when 'mtg_100_common' then 100 when 'mtg_100_rare' then 100
    when 'pkm_100' then 100 when 'pkm_100_ex' then 100
    when 'mtg_10_dollar' then 10 when 'mtg_10_fifty' then 10
    when 'pkm_10_dollar' then 10 when 'pkm_10_fifty' then 10
  end
$function$;

CREATE OR REPLACE FUNCTION internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, removed, totals, lines, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', p_action, b.id, p_target,
          coalesce(p_games, '{}'), coalesce(p_removed, 0), p_totals,
          coalesce(p_lines, '[]'::jsonb), coalesce(p_summary, ''));
end;
$function$;

CREATE OR REPLACE FUNCTION internal.buy_number(p_buy buys)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
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

CREATE OR REPLACE FUNCTION internal.cant_upload_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid := cant_upload_ensure();
  b       buys;
  v_pos   integer;
  v_cards integer;
  v_lines jsonb;
begin
  if coalesce(array_length(p_lines, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select coalesce(max(position), 0) into v_pos from buy_lines where buy_id = v_sys;
  insert into buy_lines (buy_id, position, game, lang, name, name_key, set_code, set_name, source_set_id,
                         collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
                         quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
                         scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id,
                         image_url, name_en, source_line_id, source_note)
  select v_sys, v_pos + row_number() over (order by k.ord), l.game, l.lang, l.name, l.name_key, l.set_code,
         l.set_name, l.source_set_id, l.collector_number, l.printed_size, l.rarity, l.finish, l.first_edition,
         l.treatments, l.condition, l.quantity, l.unit_price, l.market_price, l.price_source, l.price_snapshot,
         l.priced_at, l.scryfall_id, l.oracle_id, l.tcgdex_id, l.tcgplayer_id, l.justtcg_card_id,
         l.justtcg_variant_id, l.image_url, l.name_en, l.id, p_notes ->> l.id::text
    from unnest(p_lines) with ordinality as k(id, ord)
    join buy_lines l on l.id = k.id;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '+', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.id = any(p_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'cant_upload_added', array['mtg'], v_cards, 0, null, v_lines, '[]',
    format('%s card%s from %s couldn''t be matched to Crystal Commerce.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.cant_upload_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid;
  b       buys;
  v_cards integer;
  v_lines jsonb;
begin
  select id into v_sys from buys where system_key = 'cant_upload';
  if v_sys is null or coalesce(array_length(p_originals, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '-', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.buy_id = v_sys and l.source_line_id = any(p_originals);
  if coalesce(v_cards, 0) = 0 then return 0; end if;
  delete from buy_lines where buy_id = v_sys and source_line_id = any(p_originals);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'cant_upload_returned', array['mtg'], 0, v_cards, null, v_lines, '[]',
    format('%s card%s taken back out: the export of %s was undone.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.cc_custom_sku(p_at timestamp with time zone DEFAULT now())
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select to_char(p_at at time zone 'America/Los_Angeles', 'FMMMDDYY');
$function$;

CREATE OR REPLACE FUNCTION internal.cc_custom_sku_day(p_day date)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select to_char(p_day, 'FMMMDDYY');
$function$;

CREATE OR REPLACE FUNCTION internal.check_rate(p numeric)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if p is not null and (p < 0 or p > 100 or p <> round(p, 2)) then
    raise exception 'bad_pct';
  end if;
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
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_id, target_name, games, added, removed, totals, lines, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'collection', p_action,
          b.id, b.customer_name, coalesce(p_games, '{}'), coalesce(p_added, 0), coalesce(p_removed, 0),
          p_totals, coalesce(p_lines, '[]'::jsonb), coalesce(p_fields, '[]'::jsonb), coalesce(p_summary, ''));
end;
$function$;

CREATE OR REPLACE FUNCTION internal.collection_for_write(p_buy_id uuid, p_device uuid, p_expected_version integer, p_content boolean)
 RETURNS buys
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  v_lock collection_locks;
begin
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  -- Can't upload cards: no adding, editing or detail changes (spec 9.1).
  if p_content and b.system_key is not null then
    raise exception 'system_collection';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is null or v_lock.device_id is distinct from p_device then
    raise exception 'not_lock_holder';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  -- A project is Paid/Ours from the start and stays editable until it's
  -- exported (owner, 2026-10-01).
  if p_content and b.status = 'paid' and not b.project then
    raise exception 'collection_paid';
  end if;
  if p_content and b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  -- Rejected: locked like Completed (owner, 2026-10-09).
  if p_content and b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.count_text(p_cards integer, p_bulk integer, p_word text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case
    when coalesce(p_bulk, 0) = 0 or coalesce(p_cards, 0) <> 0 then
      concat_ws(' ', to_char(coalesce(p_cards, 0), 'FM999,999,990'), p_word,
                case when coalesce(p_cards, 0) = 1 then 'card' else 'cards' end)
      || case when coalesce(p_bulk, 0) <> 0 then ' + ' || to_char(p_bulk, 'FM999,999,990') || ' bulk' else '' end
    else concat_ws(' ', to_char(p_bulk, 'FM999,999,990'), p_word, 'bulk')
  end
$function$;

CREATE OR REPLACE FUNCTION internal.customer_key(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select lower(internal.customer_name(p_name))
$function$;

CREATE OR REPLACE FUNCTION internal.customer_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')
$function$;

CREATE OR REPLACE FUNCTION internal.export_check(p_lines uuid[], p_matches jsonb, p_cant uuid[], p_file uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_given uuid[];
begin
  select array_agg(x) into v_given from (
    select (e ->> 'line_id')::uuid as x from jsonb_array_elements(p_matches) e
    union all
    select unnest(p_cant)) s;
  if p_lines is null or v_given is null
     or array_length(v_given, 1) <> (select count(distinct x) from unnest(v_given) x)
     or not (v_given @> p_lines and p_lines @> v_given) then
    raise exception 'stale_version';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where not exists (select 1 from cc_products p
                                 where p.file_id = p_file and p.product_id = e ->> 'product_id')) then
    raise exception 'stale_inventory';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0.40) then
    raise exception 'bad_price';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.export_learn(p_matches jsonb, p_set_maps jsonb, p_file uuid, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  insert into cc_product_links (scryfall_id, finish, product_id, product_name, category, source, linked_at, linked_by)
  select distinct on (l.scryfall_id, l.finish)
         l.scryfall_id, l.finish, p.product_id, p.product_name, p.category, e ->> 'link', now(), p_user
    from jsonb_array_elements(p_matches) e
    join buy_lines l on l.id = (e ->> 'line_id')::uuid
    join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
   where e ->> 'link' in ('staff', 'auto')
     and l.scryfall_id is not null and l.finish in ('nonfoil', 'foil', 'etched')
   order by l.scryfall_id, l.finish, (e ->> 'link') = 'staff' desc
  on conflict (scryfall_id, finish) do update set
    product_id = excluded.product_id, product_name = excluded.product_name, category = excluded.category,
    source = excluded.source, linked_at = excluded.linked_at, linked_by = excluded.linked_by;
  insert into cc_set_map (scryfall_set, promo_kind, category, source, updated_at, updated_by)
  select distinct on (lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''))
         lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''), s ->> 'category', 'staff', now(), p_user
    from jsonb_array_elements(coalesce(p_set_maps, '[]'::jsonb)) s
   where coalesce(s ->> 'scryfall_set', '') <> ''
     and coalesce(s ->> 'promo_kind', '') in ('', 'prerelease', 'promopack')
     and exists (select 1 from cc_products p where p.file_id = p_file and p.category = s ->> 'category')
  on conflict (scryfall_set, promo_kind) do update set
    category = excluded.category, source = 'staff', updated_at = excluded.updated_at, updated_by = excluded.updated_by;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.export_line_text(l buy_lines, p_qty integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select concat_ws(' ',
    coalesce(p_qty, l.quantity) || ' ' || coalesce(l.name_en, l.name) || ' (' || l.set_code || ') ' || l.collector_number,
    case l.finish when 'foil' then '*F*' when 'etched' then '*E*' end,
    case when l.condition <> 'NM' then '[' || l.condition || ']' end);
$function$;

CREATE OR REPLACE FUNCTION internal.export_stamp(p_matches jsonb, p_file uuid, p_sku text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines l set
    cc_status       = 'exported',
    cc_product_id   = p.product_id,
    cc_product_name = p.product_name,
    cc_category     = p.category,
    cc_condition    = cc_condition_word(l.condition),
    cc_sell_price   = round((e ->> 'sell_price')::numeric, 2),
    cc_sell_basis   = e -> 'sell_basis',
    cc_custom_sku   = p_sku,
    cc_exported_at  = now()
  from jsonb_array_elements(p_matches) e
  join cc_products p on p.file_id = p_file and p.product_id = e ->> 'product_id'
  where l.id = (e ->> 'line_id')::uuid;
$function$;

CREATE OR REPLACE FUNCTION internal.fix_line_rates(b buys)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines l
     set cash_pct = internal.line_pct(l, b, 'cash'),
         credit_pct = internal.line_pct(l, b, 'credit')
   where l.buy_id = b.id;
$function$;

CREATE OR REPLACE FUNCTION internal.import_lines(b buys, p_lines jsonb, p_user uuid, p_device uuid, p_file text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  r       buy_lines;
  v_item  jsonb;
  v_pos   integer := 0;
  v_cards integer := 0;
  v_sum   numeric := 0;
  v_rows  jsonb := '[]';
  v_file  text := nullif(btrim(coalesce(p_file, '')), '');
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing_to_import';
  end if;
  if exists (select 1 from buy_lines where buy_id = b.id) then
    raise exception 'not_empty';
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    r := jsonb_populate_record(null::buy_lines, v_item);
    if r.game is distinct from 'mtg' then
      raise exception 'import_magic_only';
    end if;
    if r.quantity is null or r.quantity < 1 or r.unit_price is null or r.unit_price < 0 then
      raise exception 'bad_import_line';
    end if;
    v_pos := v_pos + 1;
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      b.id, v_pos, 'mtg', 'en', r.name, null, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, false,
      coalesce(r.treatments, '[]'::jsonb), coalesce(r.condition, 'NM'), r.quantity, r.unit_price, r.market_price,
      'import', r.price_snapshot, coalesce(r.priced_at, now()), r.scryfall_id, r.oracle_id, null,
      r.tcgplayer_id, null, null, r.image_url);
    v_cards := v_cards + r.quantity;
    v_sum := v_sum + r.unit_price * r.quantity;
    v_rows := v_rows || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', 'mtg',
      'unit_price', r.unit_price, 'text', coalesce(v_item ->> 'text', r.quantity || ' ' || r.name));
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform collection_event(b, p_user, p_device, 'collection_imported', array['mtg'], v_cards, 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), v_rows,
    case when v_file is not null
         then jsonb_build_array(jsonb_build_object('field', 'file', 'before', null, 'after', v_file))
         else '[]'::jsonb end,
    sentence(format('%s card%s imported%s', v_cards, case when v_cards = 1 then '' else 's' end,
      case when v_file is not null then ' from ' || v_file else '' end)));
  return v_cards;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.line_counts(p_lines buy_lines[], OUT cards integer, OUT bulk integer)
 RETURNS record
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(sum(l.quantity) filter (where internal.bulk_per(l.bulk_kind) is null), 0)::integer,
         coalesce(sum(l.quantity * internal.bulk_per(l.bulk_kind)), 0)::integer
    from unnest(p_lines) l
$function$;

CREATE OR REPLACE FUNCTION internal.line_pct(l buy_lines, b buys, p_side text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case
           when p_side = 'cash' and l.cash_pct is not null then l.cash_pct
           when p_side = 'credit' and l.credit_pct is not null then l.credit_pct
           when p_side = 'cash' and l.custom_cash_pct is not null then l.custom_cash_pct
           when p_side = 'credit' and l.custom_credit_pct is not null then l.custom_credit_pct
           when b.custom_cash_pct is not null or b.custom_credit_pct is not null then x.base
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price < (x.t -> 'low' ->> 'under')::numeric then (x.t -> 'low' ->> p_side)::numeric
           when (l.bulk_kind is null or l.bulk_kind like '%placeholder') and l.unit_price > (x.t -> 'high' ->> 'over')::numeric then (x.t -> 'high' ->> p_side)::numeric
           else x.base end
  from (select internal.rate_tiers() as t,
               case p_side when 'cash' then coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct'))
                           else coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')) end as base) x
$function$;

CREATE OR REPLACE FUNCTION internal.lines_count_text(p_lines buy_lines[], p_word text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select internal.count_text(c.cards, c.bulk, p_word) from internal.line_counts(p_lines) c
$function$;

CREATE OR REPLACE FUNCTION internal.lines_totals(b buys, p_lines buy_lines[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
           'market', coalesce(sum(x.m), 0),
           'cash', round_down_price(coalesce(sum(x.m * x.c), 0) / 100)::numeric(12,2),
           'credit', round_down_price(coalesce(sum(x.m * x.cr), 0) / 100)::numeric(12,2),
           'cash_pct', coalesce(b.cash_pct, b.custom_cash_pct, master_pct('cash_pct')),
           'credit_pct', coalesce(b.credit_pct, b.custom_credit_pct, master_pct('credit_pct')))
  from (select l.unit_price * l.quantity as m,
               internal.line_pct(l, b, 'cash') as c,
               internal.line_pct(l, b, 'credit') as cr
          from unnest(coalesce(p_lines, '{}'::buy_lines[])) l) x
$function$;

CREATE OR REPLACE FUNCTION internal.next_buy_number()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  -- One confirm at a time takes a number: held till its save ends (decision 349).
  perform pg_advisory_xact_lock(hashtext('pug.buys.number'));
  return greatest(coalesce((select max(number) from buys), 0),
                  (select case when is_called then last_value else last_value - 1 end from buys_number_seq)) + 1;
end;
$function$;

CREATE OR REPLACE FUNCTION internal.norm_number(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select lower(regexp_replace(btrim(coalesce(p, '')), '^([a-zA-Z]*-?)0+(?=[0-9])', '\1'))
$function$;

CREATE OR REPLACE FUNCTION internal.rate_tiers()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
           'low', '{"under": 3, "credit": 50, "cash": 25}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'low') = 'object' then s.v -> 'low' end, '{}'::jsonb),
           'high', '{"over": 35, "credit": 70, "cash": 40}'::jsonb
                  || coalesce(case when jsonb_typeof(s.v -> 'high') = 'object' then s.v -> 'high' end, '{}'::jsonb))
  from (select (select value from settings where key = 'rate_tiers') as v) s
$function$;

CREATE OR REPLACE FUNCTION internal.restore_line(p_line_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
$function$;

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

CREATE OR REPLACE FUNCTION internal.same_line(a buy_lines, b buy_lines)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
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
     -- Stamped and unstamped are never one line (decision 345).
     and a.cc_status is not distinct from b.cc_status
$function$;

CREATE OR REPLACE FUNCTION internal.scans_finished(p_device uuid, p_buy uuid, p_note text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update scans set status = 'failed', note = p_note, handled_at = now()
   where p_device is not null and session_device_id = p_device and target_kind = 'walk_in'
     and (target_draft_id = p_buy or target_draft_id is null)
     and status in ('sent', 'pricing', 'needs_price');
$function$;

CREATE OR REPLACE FUNCTION internal.strike_line(p_line_id uuid, p_n integer, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION internal.unfix_line_rates(p_buy_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update buy_lines set cash_pct = null, credit_pct = null where buy_id = p_buy_id;
$function$;

CREATE OR REPLACE FUNCTION public.backup_counts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
    'buys',        (select count(*) from buys where kind = 'walk_in' and status = 'confirmed'),
    'collections', (select count(*) from buys where kind = 'collection'),
    'lines',       (select count(*) from buy_lines),
    'events',      (select count(*) from events),
    'users',       (select count(*) from staff_users where active))
$function$;

CREATE OR REPLACE FUNCTION public.backup_export()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select jsonb_build_object(
    'format', 'pug-pricing-backup',
    'version', 1,
    'exported_at', now(),
    'tables', jsonb_build_object(
      'staff_users', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from staff_users t), '[]'),
      'devices',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from devices t), '[]'),
      'buys',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from buys t), '[]'),
      'buy_lines',   coalesce((select jsonb_agg(to_jsonb(t) order by t.buy_id, t.position, t.id) from buy_lines t), '[]'),
      'events',      coalesce((select jsonb_agg(to_jsonb(t) - 'search_text' - 'search_digits' order by t.seq) from events t), '[]'),
      'settings',    coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from settings t), '[]'),
      -- The matches staff taught (decision 348).
      'cc_set_map',       coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_set, t.promo_kind) from cc_set_map t), '[]'),
      'cc_product_links', coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_id, t.finish) from cc_product_links t), '[]'),
      'import_links',     coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from import_links t), '[]')))
$function$;

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
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, day, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'cash_buys_downloaded',
          'Cash buys · ' || to_char(v_month, 'FMMonth YYYY'), v_month, coalesce(p_summary, ''));
end;
$function$;

CREATE OR REPLACE FUNCTION public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_count  integer;
  v_lines  uuid[];
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
    -- A Magic buy Completed instead of exported means something else happened
    -- to its cards (owner, 2026-10-18; decision 295): they're struck too, with
    -- struck_at = completed_at so Paid/Ours again knows which ones to restore.
    select array_agg(id) into v_lines from buy_lines
     where buy_id = b.id and game = p_game and completed_at is null and bulk_kind is null and struck_at is null;
    update buy_lines
       set completed_at = now(), completed_by = p_user,
           struck_at = case when p_game = 'mtg' then now() else struck_at end,
           struck_by = case when p_game = 'mtg' then p_user else struck_by end
     where id = any(coalesce(v_lines, '{}'::uuid[]));
  else
    -- COMPLETE's Sell Prices go with it (owner, 2026-10-09); the cards the
    -- completion struck come back.
    select array_agg(id) into v_lines from buy_lines
     where buy_id = b.id and game = p_game and completed_at is not null and cc_status is null;
    update buy_lines set struck_at = null, struck_by = null
     where id = any(coalesce(v_lines, '{}'::uuid[])) and struck_at = completed_at;
    update buy_lines set completed_at = null, completed_by = null, cc_sell_price = null, cc_sell_basis = null
     where id = any(coalesce(v_lines, '{}'::uuid[]));
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return 0;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select sum(quantity), sum(unit_price * quantity) into v_cards, v_market
    from buy_lines where id = any(coalesce(v_lines, '{}'::uuid[]));
  perform buy_event(b, p_user, p_device,
    case when p_complete then 'buy_completed' else 'buy_uncompleted' end,
    buy_target_name(b.id), array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id and l.game = p_game)), '[]'::jsonb,
    case when p_complete
         then format('%s %s card%s marked Completed without exporting%s: left out of the search and the day''s export.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end,
                     case when p_game = 'mtg' then ', and struck' else '' end)
         else format('%s %s card%s marked Paid/Ours again.',
                     coalesce(v_cards, 0), v_game, case when coalesce(v_cards, 0) = 1 then '' else 's' end) end);
  return v_count;
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

CREATE OR REPLACE FUNCTION public.buy_set_condition_check(p_buy_id uuid, p_flag boolean, p_user uuid, p_device uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_flag   boolean := coalesce(p_flag, false);
  v_games  text[];
  v_market numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  if b.condition_check = v_flag then
    return v_flag;   -- as it was (a buy never flagged stays without a check): nothing to log
  end if;
  update buys
     set condition_check = v_flag,
         condition_checked_at = case when v_flag then null else now() end,
         condition_checked_by = case when v_flag then null else p_user end,
         updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  select array(select distinct game from buy_lines where buy_id = b.id order by 1),
         coalesce(sum(unit_price * quantity), 0)
    into v_games, v_market
    from buy_lines where buy_id = b.id;
  perform buy_event(b, p_user, p_device,
    case when v_flag then 'buy_flagged' else 'buy_flag_cleared' end,
    buy_target_name(b.id), v_games, 0, internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), '[]'::jsonb,
    case when v_flag then 'Flagged: its cards need their condition checked before export.'
         else 'Condition checked: the flag is off.' end);
  return v_flag;
end;
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
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g)
    into v_games
    from (select distinct game as g from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null;
  -- Struck cards stay out of the collection, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null;

  -- The buy's customer, phone, notes, payment and rates; its user as the maker.
  insert into buys (kind, status, project, customer_name, phone, id_last4, notes, paid_at,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', false, v_name, b.phone, '1312', coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.custom_cash_pct, b.custom_credit_pct,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  -- The cards keep the rates CONFIRM BUY saved on them.
  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null;

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
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null),
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
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null) then
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
            from buy_lines where buy_id = b.id and completed_at is null group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null;
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null;

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null;
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
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null),
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

CREATE OR REPLACE FUNCTION public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_count    integer;
  v_cards    integer;
  v_market   numeric;
  v_returned integer;
  v_target   text;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null then raise exception 'bad_game'; end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then raise exception 'buy_gone'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'stale_version'; end if;

  select array_agg(id), count(*) into v_lines, v_count
    from buy_lines where buy_id = b.id and game = p_game and completed_at is not null
     -- Not the Magic cards Mark as completed struck: they went elsewhere (decision 340).
     and struck_at is distinct from completed_at;
  if v_lines is null then return 0; end if;
  v_target := buy_target_name(b.id);

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, v_target, p_user, p_device);

  select coalesce(sum(quantity), 0), coalesce(sum(unit_price * quantity), 0) into v_cards, v_market
    from buy_lines where id = any(v_lines);
  perform buy_event(b, p_user, p_device, 'buy_unexported', v_target, array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
    format('%s %s card%s marked Paid/Ours again%s.', v_cards, v_game, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                            case when v_returned = 1 then '' else 's' end)
                else '' end));
  return v_count;
end;
$function$;

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
$function$;

CREATE OR REPLACE FUNCTION public.cant_upload_ensure()
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  select id into v_id from buys where system_key = 'cant_upload';
  if v_id is null then
    insert into buys (kind, status, customer_name, phone, notes, system_key, paid_at)
    values ('collection', 'paid', 'Can''t upload cards', null, cant_upload_note(), 'cant_upload', now())
    on conflict (system_key) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from buys where system_key = 'cant_upload';
    end if;
  end if;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cant_upload_note()
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select 'Cards that couldn''t be matched to a Crystal Commerce product during an export. Pull them out of the '
      || 'upload batch. They stay here until they''re exported from here or deleted.';
$function$;

CREATE OR REPLACE FUNCTION public.cc_candidates(p_wants jsonb)
 RETURNS TABLE(key text, product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select w.key, p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from jsonb_to_recordset(p_wants) as w(key text, category text, base_keys text[])
    join cc_products p
      on p.file_id = cc_current_file()
     and p.base_key = any(w.base_keys)
     and (w.category is null or p.category = w.category)
   order by w.key, p.category, p.product_name
$function$;

CREATE OR REPLACE FUNCTION public.cc_categories()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(array_agg(distinct category order by category), '{}')
    from cc_products where file_id = cc_current_file()
$function$;

CREATE OR REPLACE FUNCTION public.cc_condition_word(p_condition text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p_condition
    when 'NM' then 'Near Mint' when 'LP' then 'Lightly Played' when 'MP' then 'Moderately Played'
    when 'HP' then 'Heavily Played' when 'DMG' then 'Damaged' end;
$function$;

CREATE OR REPLACE FUNCTION public.cc_current_file()
 RETURNS uuid
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select id from master_inventory_files where is_current limit 1
$function$;

CREATE OR REPLACE FUNCTION public.cc_products_by_id(p_ids text[])
 RETURNS TABLE(product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select product_id, cc_id, product_name, category, base_key, bracket, foil_kind, variants
    from cc_products
   where file_id = cc_current_file() and product_id = any(p_ids)
$function$;

CREATE OR REPLACE FUNCTION public.cc_products_load(p_file_id uuid, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if not exists (select 1 from master_inventory_files where id = p_file_id and not is_current) then
    raise exception 'upload_gone';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'bad_batch';
  end if;
  insert into cc_products (file_id, product_id, cc_id, product_name, category, base_key, bracket,
                           foil_kind, variants, catalog_path)
  select p_file_id, r.product_id, r.cc_id, r.product_name, coalesce(r.category, ''), coalesce(r.base_key, ''),
         r.bracket, r.foil_kind, coalesce(r.variants, '{}'), coalesce(r.catalog_path, '')
    from jsonb_to_recordset(p_rows) as r(product_id text, cc_id text, product_name text, category text,
                                         base_key text, bracket text, foil_kind text, variants text[],
                                         catalog_path text)
   where r.product_id is not null and r.product_name is not null
  on conflict (file_id, product_id) do update
     set cc_id = excluded.cc_id, product_name = excluded.product_name, category = excluded.category,
         base_key = excluded.base_key, bracket = excluded.bracket, foil_kind = excluded.foil_kind,
         variants = excluded.variants, catalog_path = excluded.catalog_path;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cc_products_search(p_text text, p_limit integer DEFAULT 30)
 RETURNS TABLE(product_id text, cc_id text, product_name text, category text, base_key text, bracket text, foil_kind text, variants text[])
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_text, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from cc_products p, q
   where p.file_id = cc_current_file()
     and length(btrim(coalesce(p_text, ''))) >= 2
     and (p.base_key like q.pat or lower(p.product_name) like q.pat)
   order by length(p.product_name), p.product_name
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
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

CREATE OR REPLACE FUNCTION public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_last4 text := nullif(upper(btrim(coalesce(p_id_last4, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  b       buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  -- No phone is allowed (the app's Ctrl+click Create, owner 2026-10-09);
  -- one given must still be 10 digits.
  if v_phone is not null and v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
    raise exception 'bad_last4';
  end if;

  insert into buys (kind, status, customer_name, phone, id_last4, notes, created_by, last_edited_by)
  values ('collection', 'processing', v_name, v_phone, v_last4, v_notes, p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name))
    || case when v_phone is not null
            then jsonb_build_array(jsonb_build_object('field', 'phone', 'before', null, 'after', format_phone(v_phone)))
            else '[]'::jsonb end
    || case when v_last4 is not null
            then jsonb_build_array(jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', v_last4))
            else '[]'::jsonb end
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Collection created for %s', v_name)));
  return b.id;
end;
$function$;

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

CREATE OR REPLACE FUNCTION public.collection_import(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_file text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  return import_lines(b, p_lines, p_user, p_device, p_file);
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b buys;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into b from buys where id = p_buy_id and kind = 'collection';
  if b.id is null then raise exception 'collection_gone'; end if;
  perform internal.collection_event(b, p_user, p_device, 'collection_called', '{}', 0, 0, null, '[]', '[]', p_summary);
end;
$function$;

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
  -- Exported, or in Can't upload cards: Undo export first (decision 345).
  if v_old.cc_status is not null then
    raise exception 'line_exported';
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

CREATE OR REPLACE FUNCTION public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_before numeric;
  v_after  numeric;
  v_n      integer;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status = 'paid' and b.system_key is null and not b.project then
    raise exception 'collection_paid';
  end if;
  select coalesce(sum(unit_price * quantity), 0) into v_before from buy_lines where buy_id = p_buy_id;

  update buy_lines l set
    unit_price         = (e ->> 'unit_price')::numeric,
    market_price       = (e ->> 'market_price')::numeric,
    price_source       = e ->> 'price_source',
    price_snapshot     = e -> 'price_snapshot',
    priced_at          = coalesce((e ->> 'priced_at')::timestamptz, now()),
    justtcg_card_id    = e ->> 'justtcg_card_id',
    justtcg_variant_id = e ->> 'justtcg_variant_id'
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e
  where l.id = (e ->> 'line_id')::uuid and l.buy_id = p_buy_id
    and l.cc_status is null;   -- an exported card keeps its price (decision 345)
  get diagnostics v_n = row_count;

  select coalesce(sum(unit_price * quantity), 0) into v_after from buy_lines where buy_id = p_buy_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_repriced', '{}', 0, 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), '[]',
    jsonb_build_array(jsonb_build_object('field', 'market', 'before', money_text(v_before), 'after', money_text(v_after))),
    format('Repriced at today''s prices: %s card line%s, market %s → %s.', v_n,
           case when v_n = 1 then '' else 's' end, money_text(v_before), money_text(v_after)));
  return jsonb_build_object('lines', v_n, 'before', v_before, 'after', v_after);
end;
$function$;

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
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
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
$function$;

CREATE OR REPLACE FUNCTION public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric DEFAULT NULL::numeric, p_offer_credit numeric DEFAULT NULL::numeric, p_paid_price numeric DEFAULT NULL::numeric, p_paid_method text DEFAULT NULL::text, p_reason text DEFAULT NULL::text)
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
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    perform internal.fix_line_rates(b);
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
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
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
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

CREATE OR REPLACE FUNCTION public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_cards    integer;
  v_returned integer;
  v_skus     text;
begin
  if p_user is null then raise exception 'no_user'; end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- Can't upload cards' own export moves its copies out; there's nothing here to undo.
  if b.system_key is not null then raise exception 'system_collection'; end if;
  select array_agg(id), sum(quantity), string_agg(distinct cc_custom_sku, ', ')
    into v_lines, v_cards, v_skus
    from buy_lines where buy_id = b.id and cc_status is not null;
  if v_lines is null then raise exception 'nothing_to_undo'; end if;

  update buy_lines set
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, b.customer_name, p_user, p_device);

  perform collection_event(b, p_user, p_device, 'collection_unexported', array['mtg'], 0, 0, null, '[]', '[]',
    format('Export undone%s: %s card%s no longer marked exported%s.',
           case when v_skus is not null then ' (Custom SKU ' || v_skus || ')' else '' end,
           v_cards, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s taken back out of Can''t upload cards', v_returned)
                else '' end));
  return jsonb_build_object('cards', v_cards, 'returned', v_returned);
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_name   text;
  v_phone  text;
  v_notes  text;
  v_last4  text;
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
  -- A project has no rates (owner, 2026-10-15): it's the store's own cards.
  if b.project and (p_fields ? 'custom_cash_pct' or p_fields ? 'custom_credit_pct') then
    raise exception 'project_rates';
  end if;
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_last4 := b.id_last4;
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

  if p_fields ? 'id_last4' then
    v_last4 := nullif(upper(btrim(coalesce(p_fields ->> 'id_last4', ''))), '');
    if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
      raise exception 'bad_last4';
    end if;
    if v_last4 is distinct from b.id_last4 then
      v_rows := v_rows || jsonb_build_object('field', 'last 4 ID', 'before', b.id_last4, 'after', v_last4);
      v_names := v_names || 'last 4 ID'::text;
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
     set customer_name = v_name, phone = v_phone, id_last4 = v_last4, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$function$;

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
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
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
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
     and l.struck_at is null   -- never into a struck line
     and l.cc_status is null   -- nor fold an exported one (decision 345)
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

CREATE OR REPLACE FUNCTION public.draft_for_device(p_device uuid, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  select id into v_buy from buys
   where draft_device_id = p_device and status = 'draft'
   for update;
  if v_buy is null then
    insert into buys (kind, status, draft_device_id, created_by, last_edited_by)
    values ('walk_in', 'draft', p_device, p_user, p_user)
    on conflict (draft_device_id) where status = 'draft' do nothing
    returning id into v_buy;
    if v_buy is null then
      select id into v_buy from buys
       where draft_device_id = p_device and status = 'draft'
       for update;
    end if;
  end if;
  return v_buy;
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
  v_qty integer;
begin
  select l.buy_id, l.quantity into v_buy, v_qty
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    return;   -- already gone (another tab removed it)
  end if;
  if p_qty >= v_qty then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - greatest(p_qty, 1) where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  v_buy := draft_for_device(p_device, p_user);
  update buys
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_buy;
  return v_buy;
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.buy_id into v_buy
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;
  update buy_lines set custom_cash_pct = p_cash, custom_credit_pct = p_credit where id = p_line_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$function$;

CREATE OR REPLACE FUNCTION public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy   uuid;
  v_pos   integer;
  v_other uuid;
  v_opos  integer;
  r       buy_lines;
begin
  select l.buy_id, l.position into v_buy, v_pos
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
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
   where l.buy_id = v_buy and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_pos then
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

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return p_line_id;
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
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
          v_from, array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
          format('%s %s buy%s marked Paid/Ours again%s.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end,
                 case when v_returned > 0
                      then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                                  case when v_returned = 1 then '' else 's' end)
                      else '' end));
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.format_phone(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case when p ~ '^[0-9]{10}$'
              then format('(%s) %s-%s', substr(p, 1, 3), substr(p, 4, 3), substr(p, 7, 4))
              else p end
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

CREATE OR REPLACE FUNCTION public.lock_acquire(p_buy_id uuid, p_device uuid, p_user uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.lock_heartbeat(p_buy_id uuid, p_device uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  update collection_locks
     set heartbeat_at = now(), staff_user_id = coalesce(p_user, staff_user_id)
   where buy_id = p_buy_id and device_id = p_device;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.lock_release(p_buy_id uuid, p_device uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  delete from collection_locks where buy_id = p_buy_id and device_id = p_device;
$function$;

CREATE OR REPLACE FUNCTION public.master_inventory_abort(p_file_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_path text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from master_inventory_files where id = p_file_id and not is_current returning storage_path into v_path;
  return v_path;
end;
$function$;

CREATE OR REPLACE FUNCTION public.master_inventory_finish(p_file_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  pruned text[];
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext('master_inventory_files'));
  if not exists (select 1 from master_inventory_files where id = p_file_id) then
    raise exception 'upload_gone';
  end if;
  update master_inventory_files set is_current = false where is_current;
  update master_inventory_files
     set is_current = true,
         products_loaded = (select count(*) from cc_products where file_id = p_file_id)
   where id = p_file_id;
  with gone as (
    delete from master_inventory_files where id <> p_file_id returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into pruned from gone;
  return pruned;
end;
$function$;

CREATE OR REPLACE FUNCTION public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  insert into master_inventory_files
    (storage_path, original_filename, size_bytes, row_count, columns, uploaded_by, is_current)
  values
    (p_storage_path, p_original_filename, p_size_bytes, p_row_count, p_columns, p_uploaded_by, false)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.master_pct(p_key text)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select (value #>> '{}')::numeric from settings where key = p_key
$function$;

CREATE OR REPLACE FUNCTION public.money_text(p numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case when p is null then null
              when p = trunc(p) then '$' || to_char(p, 'FM999,999,990')
              else '$' || to_char(p, 'FM999,999,990.00') end
$function$;

CREATE OR REPLACE FUNCTION public.pct_text(p numeric)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select trim_scale(p)::text
$function$;

CREATE OR REPLACE FUNCTION public.project_create(p_name text, p_notes text, p_user uuid, p_device uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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

  insert into buys (kind, status, project, customer_name, phone, notes, paid_at, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, null, v_notes, now(), p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name))
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Project started: %s', v_name)));
  return b.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.project_import(p_name text, p_notes text, p_lines jsonb, p_user uuid, p_device uuid, p_file text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
  b    buys;
begin
  v_id := project_create(p_name, p_notes, p_user, p_device);
  select * into b from buys where id = v_id;
  perform import_lines(b, p_lines, p_user, p_device, p_file);
  return v_id;
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

CREATE OR REPLACE FUNCTION public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t jsonb := p_payload -> 'tables';
  v_user staff_users;
  v_counts jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_typed is distinct from 'RESTORE' then raise exception 'not_confirmed'; end if;
  if p_payload ->> 'format' is distinct from 'pug-pricing-backup'
     or (p_payload ->> 'version') is distinct from '1'
     or jsonb_typeof(t) is distinct from 'object'
     or jsonb_typeof(t -> 'staff_users') is distinct from 'array'
     or jsonb_typeof(t -> 'devices') is distinct from 'array'
     or jsonb_typeof(t -> 'buys') is distinct from 'array'
     or jsonb_typeof(t -> 'buy_lines') is distinct from 'array'
     or jsonb_typeof(t -> 'events') is distinct from 'array'
     or jsonb_typeof(t -> 'settings') is distinct from 'array' then
    raise exception 'bad_backup';
  end if;

  lock table buys, buy_lines, events, staff_users, settings, collection_locks, customers,
             cc_set_map, cc_product_links, import_links in exclusive mode;

  -- Out with the old: locks, buys and collections (their lines go with them),
  -- the customers, the changelog, and every setting but when the last backup was taken.
  delete from collection_locks;
  delete from buys;
  delete from customers;
  delete from events;
  update settings set updated_by = null where key = 'last_backup_at';
  delete from settings where key <> 'last_backup_at';

  -- Staff users: all hidden, then the backup's put back as they were.
  update staff_users set active = false where active;
  perform restore_rows('staff_users', t -> 'staff_users',
    'on conflict (id) do update set name = excluded.name, color = excluded.color, '
    || 'active = excluded.active, created_at = excluded.created_at');
  -- Computers: the backup's are added; the ones here keep their names.
  perform restore_rows('devices', t -> 'devices', 'on conflict (id) do nothing');

  perform restore_rows('buys', t -> 'buys');
  perform restore_rows('buy_lines', t -> 'buy_lines');
  perform restore_rows('events', t -> 'events');
  perform setval(pg_get_serial_sequence('public.events', 'seq'),
                 greatest(coalesce((select max(seq) from events), 0), 1));
  -- Buy numbers carry on past the restored ones (decision 348): in a new project they'd start
  -- at 1 and collide. Numbers used after the backup was made can't be known: see SETUP.md.
  if exists (select 1 from buys where number is not null) then
    perform setval('public.buys_number_seq',
                   greatest((select max(number) from buys),
                            (select case when is_called then last_value else last_value - 1 end from public.buys_number_seq)),
                   true);
  end if;
  -- The learned matches, when the file has them (decision 348; older backups don't).
  if jsonb_typeof(t -> 'cc_set_map') = 'array' then
    delete from cc_set_map;
    perform restore_rows('cc_set_map', t -> 'cc_set_map');
  end if;
  if jsonb_typeof(t -> 'cc_product_links') = 'array' then
    delete from cc_product_links;
    perform restore_rows('cc_product_links', t -> 'cc_product_links');
  end if;
  if jsonb_typeof(t -> 'import_links') = 'array' then
    delete from import_links;
    perform restore_rows('import_links', t -> 'import_links');
  end if;
  perform restore_rows('settings',
    (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(t -> 'settings') r
      where r ->> 'key' <> 'last_backup_at'));

  -- The milestone (spec 12): always shown on the line.
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'app', 'backup_restored',
          p_file, 'Backup restored — ' || coalesce(nullif(btrim(p_file), ''), 'backup file'));

  select backup_counts() into v_counts;
  return v_counts;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restore_rows(p_table text, p_rows jsonb, p_conflict text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_cols text;
  v_count integer;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER'
     -- Only the backup's own columns: one added since takes its default (decision 348).
     and exists (select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where r ? column_name);
  if v_cols is null then
    return 0;   -- no rows
  end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                 p_table, v_cols, v_cols, p_table, p_conflict)
    using coalesce(p_rows, '[]'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.round_down_price(p numeric)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select (floor(c / s) * s) / 100
  from (select floor(round(p * 100, 6)) as c) x,
       lateral (select case when x.c >= 100000 then 1000 when x.c >= 10000 then 500
                            when x.c >= 1000 then 100 when x.c >= 100 then 25 else 1 end as s) y
$function$;

CREATE OR REPLACE FUNCTION public.scan_answer(p_id uuid, p_phone uuid, p_price numeric)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.phone_device_id <> p_phone then
    raise exception 'not_phone';
  end if;
  if v.status <> 'needs_price' then
    raise exception 'not_waiting';
  end if;
  if p_price is null then
    update scans set status = 'skipped', handled_at = now() where id = p_id;
    return;
  end if;
  if p_price < 0.01 or p_price > 99999999.99 or p_price <> round(p_price, 2) then
    raise exception 'bad_price';
  end if;
  update scans set status = 'sent', manual_price = p_price, handled_at = now() where id = p_id;
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

CREATE OR REPLACE FUNCTION public.scan_pair(p_device uuid, p_phone uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scan_sessions;
begin
  if p_phone is null or p_phone = p_device or not exists (select 1 from devices where id = p_phone) then
    raise exception 'not_a_device';
  end if;
  select * into v from scan_sessions where device_id = p_device for update;
  if not found then
    raise exception 'session_gone';
  end if;
  if v.heartbeat_at < now() - interval '60 seconds' then
    raise exception 'session_stale';
  end if;
  if v.locked is not null or not ('mtg' = any (v.games)) then
    raise exception 'cannot_scan';
  end if;

  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where phone_device_id = p_phone and device_id <> p_device;
  update scan_sessions
     set phone_device_id = p_phone,
         paired_at = case when phone_device_id = p_phone then paired_at else now() end,
         scanned = case when phone_device_id = p_phone then scanned else 0 end,
         phone_seen_at = now()
   where device_id = p_device;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_phone_beat(p_device uuid, p_phone uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  update scan_sessions set phone_seen_at = now()
   where device_id = p_device and phone_device_id = p_phone
     and heartbeat_at >= now() - interval '60 seconds';
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.session_device_id <> p_device then
    raise exception 'not_session';
  end if;
  -- An undo the computer took on: done (one copy fewer, the phone's count too), or not (back to added, saying why).
  if v.status = 'undoing' then
    if coalesce(p_status, '') not in ('undone', 'added') then
      raise exception 'bad_status';
    end if;
    update scans
       set status = p_status,
           line_qty = (select quantity from buy_lines where id = v.line_id),
           note = p_note,
           handled_at = now()
     where id = p_id;
    if p_status = 'undone' then
      update scan_sessions set scanned = greatest(scanned - 1, 0) where device_id = p_device;
    end if;
    return;
  end if;
  if coalesce(p_status, '') not in ('added', 'needs_price', 'failed') or v.status <> 'pricing' then
    raise exception 'bad_status';
  end if;

  update scans
     set status = p_status,
         line_id = p_line_id,
         line_qty = (select quantity from buy_lines where id = p_line_id),
         price = p_price,
         price_source = p_source,
         note = p_note,
         handled_at = now()
   where id = p_id;
  if p_status = 'added' then
    update scan_sessions set scanned = scanned + 1 where device_id = p_device;
  end if;
end;
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

CREATE OR REPLACE FUNCTION public.scan_session_end(p_device uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  delete from scan_sessions where device_id = p_device
$function$;

CREATE OR REPLACE FUNCTION public.scan_session_touch(p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if not exists (select 1 from devices where id = p_device) then
    raise exception 'no_device';
  end if;
  delete from scan_sessions where heartbeat_at < now() - interval '1 day';

  insert into scan_sessions as s (device_id, target_kind, buy_id, target_name, games, staff_user_id, locked, heartbeat_at)
  values (p_device, p_kind, p_buy_id, coalesce(p_name, ''), coalesce(p_games, '{}'), p_user,
          nullif(btrim(p_locked), ''), now())
  on conflict (device_id) do update
     set target_kind = excluded.target_kind,
         buy_id = excluded.buy_id,
         target_name = excluded.target_name,
         games = excluded.games,
         staff_user_id = excluded.staff_user_id,
         locked = excluded.locked,
         heartbeat_at = now(),
         phone_device_id = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_device_id end,
         paired_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.paired_at end,
         phone_seen_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_seen_at end;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_sessions_open()
 RETURNS TABLE(device_id uuid, device_label text, target_kind text, buy_id uuid, target_name text, games text[], staff_user_id uuid, staff_user_name text, locked text, can_add boolean, heartbeat_at timestamp with time zone, phone_device_id uuid, phone_label text, paired_at timestamp with time zone, phone_seen_at timestamp with time zone, scanned integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select s.device_id, d.label, s.target_kind, s.buy_id, s.target_name, s.games,
         s.staff_user_id, u.name, s.locked, s.can_add, s.heartbeat_at,
         s.phone_device_id, p.label, s.paired_at, s.phone_seen_at, s.scanned
    from scan_sessions s
    join devices d on d.id = s.device_id
    left join staff_users u on u.id = s.staff_user_id
    left join devices p on p.id = s.phone_device_id
   where s.heartbeat_at >= now() - interval '60 seconds'
   order by d.label, s.device_id
$function$;

CREATE OR REPLACE FUNCTION public.scan_undo(p_id uuid, p_phone uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.phone_device_id <> p_phone then
    raise exception 'not_phone';
  end if;
  if v.status <> 'added' then
    raise exception 'not_added';
  end if;
  update scans set status = 'undo', note = null, handled_at = now() where id = p_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_unpair(p_device uuid, p_phone uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  if not exists (select 1 from scan_sessions where device_id = p_device) then
    raise exception 'session_gone';
  end if;
  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where device_id = p_device and (p_phone is null or phone_device_id = p_phone);
end;
$function$;

CREATE OR REPLACE FUNCTION public.search_set_codes()
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select coalesce(array_agg(distinct lower(set_code)), '{}') from buy_lines
$function$;

CREATE OR REPLACE FUNCTION public.sentence(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select regexp_replace(p, '\.?$', '.')
$function$;

CREATE OR REPLACE FUNCTION public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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

CREATE OR REPLACE FUNCTION public.status_label(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select case p when 'processing' then 'Processing' when 'priced' then 'Priced'
                when 'paid' then 'Paid/Ours' when 'completed' then 'Completed'
                when 'rejected' then 'Rejected' else p end
$function$;


-- ==========================================================================
-- Column defaults
-- ==========================================================================
alter table public.api_usage alter column id set default 1;
alter table public.api_usage alter column updated_at set default now();
alter table public.buy_lines alter column id set default gen_random_uuid();
alter table public.buy_lines alter column lang set default 'en'::text;
alter table public.buy_lines alter column first_edition set default false;
alter table public.buy_lines alter column treatments set default '[]'::jsonb;
alter table public.buy_lines alter column condition set default 'NM'::text;
alter table public.buy_lines alter column created_at set default now();
alter table public.buys alter column id set default gen_random_uuid();
alter table public.buys alter column notes set default ''::text;
alter table public.buys alter column created_at set default now();
alter table public.buys alter column updated_at set default now();
alter table public.buys alter column version set default 1;
alter table public.buys alter column project set default false;
alter table public.buys alter column condition_check set default false;
alter table public.cc_product_links alter column linked_at set default now();
alter table public.cc_products alter column variants set default '{}'::text[];
alter table public.cc_products alter column catalog_path set default ''::text;
alter table public.cc_set_map alter column promo_kind set default ''::text;
alter table public.cc_set_map alter column source set default 'staff'::text;
alter table public.cc_set_map alter column updated_at set default now();
alter table public.collection_locks alter column acquired_at set default now();
alter table public.collection_locks alter column heartbeat_at set default now();
alter table public.customers alter column last_used set default now();
alter table public.devices alter column last_seen_at set default now();
alter table public.events alter column seq set default nextval('events_seq_seq'::regclass);
alter table public.events alter column at set default now();
alter table public.events alter column games set default '{}'::text[];
alter table public.events alter column added set default 0;
alter table public.events alter column removed set default 0;
alter table public.events alter column lines set default '[]'::jsonb;
alter table public.events alter column fields set default '[]'::jsonb;
alter table public.events alter column summary set default ''::text;
alter table public.import_links alter column linked_at set default now();
alter table public.master_inventory_files alter column id set default gen_random_uuid();
alter table public.master_inventory_files alter column columns set default '{}'::text[];
alter table public.master_inventory_files alter column uploaded_at set default now();
alter table public.master_inventory_files alter column is_current set default false;
alter table public.price_cache alter column fetched_at set default now();
alter table public.price_map alter column resolved_at set default now();
alter table public.scan_sessions alter column target_name set default ''::text;
alter table public.scan_sessions alter column games set default '{}'::text[];
alter table public.scan_sessions alter column heartbeat_at set default now();
alter table public.scan_sessions alter column scanned set default 0;
alter table public.scans alter column id set default gen_random_uuid();
alter table public.scans alter column name set default ''::text;
alter table public.scans alter column set_code set default ''::text;
alter table public.scans alter column collector_number set default ''::text;
alter table public.scans alter column tier set default 1;
alter table public.scans alter column status set default 'sent'::text;
alter table public.scans alter column created_at set default now();
alter table public.secrets alter column updated_at set default now();
alter table public.settings alter column updated_at set default now();
alter table public.staff_users alter column id set default gen_random_uuid();
alter table public.staff_users alter column active set default true;
alter table public.staff_users alter column created_at set default now();

-- ==========================================================================
-- Constraints (keys and checks, then foreign keys)
-- ==========================================================================
alter table public.api_usage add constraint api_usage_pkey PRIMARY KEY (id);
alter table public.buy_lines add constraint buy_lines_pkey PRIMARY KEY (id);
alter table public.buys add constraint buys_pkey PRIMARY KEY (id);
alter table public.cc_product_links add constraint cc_product_links_pkey PRIMARY KEY (scryfall_id, finish);
alter table public.cc_products add constraint cc_products_pkey PRIMARY KEY (file_id, product_id);
alter table public.cc_set_map add constraint cc_set_map_pkey PRIMARY KEY (scryfall_set, promo_kind);
alter table public.collection_locks add constraint collection_locks_pkey PRIMARY KEY (buy_id);
alter table public.customers add constraint customers_pkey PRIMARY KEY (name_key);
alter table public.devices add constraint devices_pkey PRIMARY KEY (id);
alter table public.events add constraint events_pkey PRIMARY KEY (seq);
alter table public.import_links add constraint import_links_pkey PRIMARY KEY (key);
alter table public.master_inventory_files add constraint master_inventory_files_pkey PRIMARY KEY (id);
alter table public.price_cache add constraint price_cache_pkey PRIMARY KEY (key);
alter table public.price_map add constraint price_map_pkey PRIMARY KEY (source_key);
alter table public.scan_sessions add constraint scan_sessions_pkey PRIMARY KEY (device_id);
alter table public.scans add constraint scans_pkey PRIMARY KEY (id);
alter table public.secrets add constraint secrets_pkey PRIMARY KEY (provider);
alter table public.settings add constraint settings_pkey PRIMARY KEY (key);
alter table public.staff_users add constraint staff_users_pkey PRIMARY KEY (id);
alter table public.buys add constraint buys_system_key_key UNIQUE (system_key);
alter table public.master_inventory_files add constraint master_inventory_files_storage_path_key UNIQUE (storage_path);
alter table public.api_usage add constraint api_usage_id_check CHECK (id = 1);
alter table public.buy_lines add constraint buy_lines_bulk_check CHECK (
CASE
    WHEN bulk_kind IS NULL THEN price_source <> 'bulk'::text AND set_code <> 'BULK'::text
    ELSE set_code = 'BULK'::text AND collector_number = ''::text AND condition = 'NM'::text AND (price_source = ANY (ARRAY['bulk'::text, 'manual'::text]))
END);
alter table public.buy_lines add constraint buy_lines_bulk_kind_check CHECK (bulk_kind = ANY (ARRAY['mtg_100_common'::text, 'mtg_100_rare'::text, 'mtg_10_dollar'::text, 'mtg_10_fifty'::text, 'pkm_100'::text, 'pkm_100_ex'::text, 'pkm_10_dollar'::text, 'pkm_10_fifty'::text, 'mtg_placeholder'::text, 'pkm_placeholder'::text]));
alter table public.buy_lines add constraint buy_lines_cash_pct_check CHECK (cash_pct >= 0::numeric AND cash_pct <= 100::numeric);
alter table public.buy_lines add constraint buy_lines_cc_sell_price_check CHECK (cc_sell_price >= 0::numeric);
alter table public.buy_lines add constraint buy_lines_cc_status_check CHECK (cc_status = ANY (ARRAY['exported'::text, 'cant_upload'::text]));
alter table public.buy_lines add constraint buy_lines_condition_check CHECK (condition = ANY (ARRAY['NM'::text, 'LP'::text, 'MP'::text, 'HP'::text, 'DMG'::text]));
alter table public.buy_lines add constraint buy_lines_credit_pct_check CHECK (credit_pct >= 0::numeric AND credit_pct <= 100::numeric);
alter table public.buy_lines add constraint buy_lines_custom_cash_pct_check CHECK (custom_cash_pct >= 0::numeric AND custom_cash_pct <= 100::numeric);
alter table public.buy_lines add constraint buy_lines_custom_credit_pct_check CHECK (custom_credit_pct >= 0::numeric AND custom_credit_pct <= 100::numeric);
alter table public.buy_lines add constraint buy_lines_finish_check CHECK (finish = ANY (ARRAY['nonfoil'::text, 'foil'::text, 'etched'::text, 'normal'::text, 'holo'::text, 'reverse'::text]));
alter table public.buy_lines add constraint buy_lines_game_check CHECK (game = ANY (ARRAY['mtg'::text, 'pokemon'::text]));
alter table public.buy_lines add constraint buy_lines_lang_check CHECK (lang = ANY (ARRAY['en'::text, 'ja'::text]));
alter table public.buy_lines add constraint buy_lines_placeholder_check CHECK (bulk_kind IS NULL OR bulk_kind !~~ '%placeholder'::text OR price_source = 'manual'::text);
alter table public.buy_lines add constraint buy_lines_price_source_check CHECK (price_source = ANY (ARRAY['justtcg'::text, 'justtcg_fallback'::text, 'scryfall_fallback'::text, 'tcgdex_fallback'::text, 'cardmarket'::text, 'manual'::text, 'import'::text, 'bulk'::text]));
alter table public.buy_lines add constraint buy_lines_quantity_check CHECK (quantity > 0);
alter table public.buy_lines add constraint buy_lines_unit_price_check CHECK (unit_price >= 0::numeric);
alter table public.buys add constraint buys_cash_pct_check CHECK (cash_pct >= 0::numeric AND cash_pct <= 100::numeric);
alter table public.buys add constraint buys_collection_needs_name CHECK (kind <> 'collection'::text OR customer_name IS NOT NULL);
alter table public.buys add constraint buys_credit_pct_check CHECK (credit_pct >= 0::numeric AND credit_pct <= 100::numeric);
alter table public.buys add constraint buys_custom_cash_pct_check CHECK (custom_cash_pct >= 0::numeric AND custom_cash_pct <= 100::numeric);
alter table public.buys add constraint buys_custom_credit_pct_check CHECK (custom_credit_pct >= 0::numeric AND custom_credit_pct <= 100::numeric);
alter table public.buys add constraint buys_id_last4_check CHECK (id_last4 IS NULL OR id_last4 ~ '^[A-Z0-9]{1,4}$'::text);
alter table public.buys add constraint buys_kind_check CHECK (kind = ANY (ARRAY['walk_in'::text, 'collection'::text]));
alter table public.buys add constraint buys_offer_cash_check CHECK (offer_cash >= 0::numeric);
alter table public.buys add constraint buys_offer_credit_check CHECK (offer_credit >= 0::numeric);
alter table public.buys add constraint buys_paid_method_check CHECK (paid_method = ANY (ARRAY['cash'::text, 'credit'::text]));
alter table public.buys add constraint buys_paid_price_check CHECK (paid_price >= 0::numeric);
alter table public.buys add constraint buys_paid_price_method CHECK ((paid_price IS NULL) = (paid_method IS NULL));
alter table public.buys add constraint buys_phone_check CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$'::text);
alter table public.buys add constraint buys_project_is_collection CHECK (NOT project OR kind = 'collection'::text AND system_key IS NULL);
alter table public.buys add constraint buys_status_for_kind CHECK (kind = 'walk_in'::text AND (status = ANY (ARRAY['draft'::text, 'confirmed'::text])) OR kind = 'collection'::text AND (status = ANY (ARRAY['processing'::text, 'priced'::text, 'paid'::text, 'completed'::text, 'rejected'::text])));
alter table public.cc_product_links add constraint cc_product_links_finish_check CHECK (finish = ANY (ARRAY['nonfoil'::text, 'foil'::text, 'etched'::text]));
alter table public.cc_product_links add constraint cc_product_links_source_check CHECK (source = ANY (ARRAY['staff'::text, 'auto'::text]));
alter table public.cc_set_map add constraint cc_set_map_promo_kind_check CHECK (promo_kind = ANY (ARRAY[''::text, 'prerelease'::text, 'promopack'::text]));
alter table public.cc_set_map add constraint cc_set_map_source_check CHECK (source = ANY (ARRAY['staff'::text, 'rule'::text]));
alter table public.devices add constraint devices_label_check CHECK (btrim(label) <> ''::text);
alter table public.events add constraint events_kind_check CHECK (kind = ANY (ARRAY['buy'::text, 'collection'::text, 'app'::text]));
alter table public.import_links add constraint import_links_finish_check CHECK (finish = ANY (ARRAY['nonfoil'::text, 'foil'::text, 'etched'::text]));
alter table public.scan_sessions add constraint scan_sessions_not_itself CHECK (phone_device_id IS DISTINCT FROM device_id);
alter table public.scan_sessions add constraint scan_sessions_scanned_check CHECK (scanned >= 0);
alter table public.scan_sessions add constraint scan_sessions_target CHECK ((target_kind = 'collection'::text) = (buy_id IS NOT NULL));
alter table public.scan_sessions add constraint scan_sessions_target_kind_check CHECK (target_kind = ANY (ARRAY['walk_in'::text, 'collection'::text]));
alter table public.scans add constraint scans_condition_check CHECK (condition = ANY (ARRAY['NM'::text, 'LP'::text, 'MP'::text, 'HP'::text, 'DMG'::text]));
alter table public.scans add constraint scans_finish_check CHECK (finish = ANY (ARRAY['nonfoil'::text, 'foil'::text, 'etched'::text]));
alter table public.scans add constraint scans_manual_price_check CHECK (manual_price IS NULL OR manual_price > 0::numeric);
alter table public.scans add constraint scans_scryfall_id_check CHECK (btrim(scryfall_id) <> ''::text);
alter table public.scans add constraint scans_status_check CHECK (status = ANY (ARRAY['sent'::text, 'pricing'::text, 'added'::text, 'needs_price'::text, 'failed'::text, 'skipped'::text, 'undo'::text, 'undoing'::text, 'undone'::text]));
alter table public.scans add constraint scans_target_kind_check CHECK (target_kind = ANY (ARRAY['walk_in'::text, 'collection'::text]));
alter table public.scans add constraint scans_tier_check CHECK (tier >= 1 AND tier <= 3);
alter table public.staff_users add constraint staff_users_color_check CHECK (color = ANY (ARRAY['pal-crimson'::text, 'pal-orange'::text, 'pal-amber'::text, 'pal-olive'::text, 'pal-green'::text, 'pal-teal'::text, 'pal-cyan'::text, 'pal-blue'::text, 'pal-indigo'::text, 'pal-violet'::text, 'pal-magenta'::text, 'pal-slate'::text]));
alter table public.staff_users add constraint staff_users_name_check CHECK (btrim(name) <> ''::text);
alter table public.buy_lines add constraint buy_lines_buy_id_fkey FOREIGN KEY (buy_id) REFERENCES buys(id) ON DELETE CASCADE;
alter table public.buy_lines add constraint buy_lines_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES staff_users(id);
alter table public.buy_lines add constraint buy_lines_source_line_id_fkey FOREIGN KEY (source_line_id) REFERENCES buy_lines(id) ON DELETE SET NULL;
alter table public.buy_lines add constraint buy_lines_struck_by_fkey FOREIGN KEY (struck_by) REFERENCES staff_users(id);
alter table public.buys add constraint buys_condition_checked_by_fkey FOREIGN KEY (condition_checked_by) REFERENCES staff_users(id);
alter table public.buys add constraint buys_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES staff_users(id);
alter table public.buys add constraint buys_created_by_fkey FOREIGN KEY (created_by) REFERENCES staff_users(id);
alter table public.buys add constraint buys_draft_device_id_fkey FOREIGN KEY (draft_device_id) REFERENCES devices(id);
alter table public.buys add constraint buys_last_edited_by_fkey FOREIGN KEY (last_edited_by) REFERENCES staff_users(id);
alter table public.cc_product_links add constraint cc_product_links_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES staff_users(id) ON DELETE SET NULL;
alter table public.cc_products add constraint cc_products_file_id_fkey FOREIGN KEY (file_id) REFERENCES master_inventory_files(id) ON DELETE CASCADE;
alter table public.cc_set_map add constraint cc_set_map_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_users(id) ON DELETE SET NULL;
alter table public.collection_locks add constraint collection_locks_buy_id_fkey FOREIGN KEY (buy_id) REFERENCES buys(id) ON DELETE CASCADE;
alter table public.collection_locks add constraint collection_locks_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices(id);
alter table public.collection_locks add constraint collection_locks_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES staff_users(id);
alter table public.import_links add constraint import_links_linked_by_fkey FOREIGN KEY (linked_by) REFERENCES staff_users(id) ON DELETE SET NULL;
alter table public.master_inventory_files add constraint master_inventory_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES staff_users(id);
alter table public.scan_sessions add constraint scan_sessions_buy_id_fkey FOREIGN KEY (buy_id) REFERENCES buys(id) ON DELETE CASCADE;
alter table public.scan_sessions add constraint scan_sessions_device_id_fkey FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE;
alter table public.scan_sessions add constraint scan_sessions_phone_device_id_fkey FOREIGN KEY (phone_device_id) REFERENCES devices(id) ON DELETE SET NULL;
alter table public.scan_sessions add constraint scan_sessions_staff_user_id_fkey FOREIGN KEY (staff_user_id) REFERENCES staff_users(id) ON DELETE SET NULL;
alter table public.scans add constraint scans_phone_device_id_fkey FOREIGN KEY (phone_device_id) REFERENCES devices(id) ON DELETE CASCADE;
alter table public.scans add constraint scans_session_device_id_fkey FOREIGN KEY (session_device_id) REFERENCES devices(id) ON DELETE CASCADE;
alter table public.settings add constraint settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES staff_users(id);

-- ==========================================================================
-- Indexes
-- ==========================================================================
CREATE INDEX buy_lines_buy ON public.buy_lines USING btree (buy_id, "position");
CREATE INDEX buy_lines_name_key_trgm ON public.buy_lines USING gin (name_key extensions.gin_trgm_ops);
CREATE INDEX buy_lines_source_line ON public.buy_lines USING btree (source_line_id) WHERE (source_line_id IS NOT NULL);
CREATE INDEX buys_confirmed_at ON public.buys USING btree (confirmed_at) WHERE (status = 'confirmed'::text);
CREATE INDEX buys_kind_status ON public.buys USING btree (kind, status);
CREATE UNIQUE INDEX buys_number_key ON public.buys USING btree (number);
CREATE UNIQUE INDEX buys_one_draft_per_device ON public.buys USING btree (draft_device_id) WHERE (status = 'draft'::text);
CREATE INDEX cc_products_base ON public.cc_products USING btree (file_id, base_key);
CREATE INDEX cc_products_base_trgm ON public.cc_products USING gin (base_key extensions.gin_trgm_ops);
CREATE INDEX cc_products_category_base ON public.cc_products USING btree (file_id, category, base_key);
CREATE INDEX customers_last_used ON public.customers USING btree (last_used DESC);
CREATE INDEX events_action_seq ON public.events USING btree (action, seq DESC);
CREATE INDEX events_at ON public.events USING btree (at DESC);
CREATE INDEX events_search_text_trgm ON public.events USING gin (search_text extensions.gin_trgm_ops);
CREATE INDEX events_target ON public.events USING btree (target_id);
CREATE UNIQUE INDEX master_inventory_one_current ON public.master_inventory_files USING btree (is_current) WHERE is_current;
CREATE UNIQUE INDEX scan_sessions_phone ON public.scan_sessions USING btree (phone_device_id) WHERE (phone_device_id IS NOT NULL);
CREATE UNIQUE INDEX scans_client ON public.scans USING btree (phone_device_id, client_id) WHERE (client_id IS NOT NULL);
CREATE INDEX scans_phone ON public.scans USING btree (phone_device_id, created_at);
CREATE INDEX scans_session ON public.scans USING btree (session_device_id, created_at);
CREATE UNIQUE INDEX staff_users_active_name_key ON public.staff_users USING btree (lower(btrim(name))) WHERE active;

-- ==========================================================================
-- Triggers
-- ==========================================================================
CREATE TRIGGER buys_remember_customer AFTER INSERT OR UPDATE OF customer_name, phone, status ON public.buys FOR EACH ROW EXECUTE FUNCTION internal.remember_customer();

-- ==========================================================================
-- Row security
-- ==========================================================================
alter table public.api_usage enable row level security;
alter table public.buy_lines enable row level security;
alter table public.buys enable row level security;
alter table public.cc_product_links enable row level security;
alter table public.cc_products enable row level security;
alter table public.cc_set_map enable row level security;
alter table public.collection_locks enable row level security;
alter table public.customers enable row level security;
alter table public.devices enable row level security;
alter table public.events enable row level security;
alter table public.import_links enable row level security;
alter table public.master_inventory_files enable row level security;
alter table public.price_cache enable row level security;
alter table public.price_map enable row level security;
alter table public.scan_sessions enable row level security;
alter table public.scans enable row level security;
alter table public.secrets enable row level security;
alter table public.settings enable row level security;
alter table public.staff_users enable row level security;
create policy "store: read" on public.api_usage as permissive for select to authenticated
  using (true);
create policy "store: full access" on public.buy_lines as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.buys as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.cc_product_links as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: read" on public.cc_products as permissive for select to authenticated
  using (true);
create policy "store: full access" on public.cc_set_map as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.collection_locks as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: read" on public.customers as permissive for select to authenticated
  using (true);
create policy "store: full access" on public.devices as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: append" on public.events as permissive for insert to authenticated
  with check (true);
create policy "store: read" on public.events as permissive for select to authenticated
  using (true);
create policy "store: full access" on public.import_links as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.master_inventory_files as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: read" on public.price_cache as permissive for select to authenticated
  using (true);
create policy "store: read" on public.price_map as permissive for select to authenticated
  using (true);
create policy "store: full access" on public.scan_sessions as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.scans as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.settings as permissive for all to authenticated
  using (true)
  with check (true);
create policy "store: full access" on public.staff_users as permissive for all to authenticated
  using (true)
  with check (true);

-- ==========================================================================
-- Privileges (as on dev, entry by entry: the fingerprints compare their text)
-- ==========================================================================
revoke all on schema internal from public, anon, authenticated, service_role;
grant usage on schema internal to authenticated;
grant usage on schema internal to service_role;
revoke all on table public.api_usage from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.api_usage to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.api_usage to service_role;
revoke all on table public.buy_lines from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.buy_lines to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.buy_lines to service_role;
revoke all on table public.buys from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.buys to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.buys to service_role;
revoke all on table public.cc_product_links from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_product_links to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_product_links to service_role;
revoke all on table public.cc_products from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_products to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_products to service_role;
revoke all on table public.cc_set_map from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_set_map to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.cc_set_map to service_role;
revoke all on table public.collection_locks from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.collection_locks to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.collection_locks to service_role;
revoke all on table public.customers from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.customers to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.customers to service_role;
revoke all on table public.devices from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.devices to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.devices to service_role;
revoke all on table public.events from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.events to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.events to service_role;
revoke all on table public.import_links from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.import_links to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.import_links to service_role;
revoke all on table public.master_inventory_files from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.master_inventory_files to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.master_inventory_files to service_role;
revoke all on table public.price_cache from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.price_cache to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.price_cache to service_role;
revoke all on table public.price_map from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.price_map to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.price_map to service_role;
revoke all on table public.scan_sessions from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.scan_sessions to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.scan_sessions to service_role;
revoke all on table public.scans from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.scans to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.scans to service_role;
revoke all on table public.secrets from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.secrets to service_role;
revoke all on table public.settings from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.settings to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.settings to service_role;
revoke all on table public.staff_users from public, anon, authenticated, service_role;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.staff_users to authenticated;
grant insert, select, update, delete, truncate, references, trigger, maintain on table public.staff_users to service_role;
revoke all on sequence public.buys_number_seq from public, anon, authenticated, service_role;
grant select, update, usage on sequence public.buys_number_seq to anon;
grant select, update, usage on sequence public.buys_number_seq to authenticated;
grant select, update, usage on sequence public.buys_number_seq to service_role;
revoke all on sequence public.events_seq_seq from public, anon, authenticated, service_role;
grant select, update, usage on sequence public.events_seq_seq to authenticated;
grant select, update, usage on sequence public.events_seq_seq to service_role;
revoke all on function internal.bulk_per(p_kind text) from public, anon, authenticated, service_role;
grant execute on function internal.bulk_per(p_kind text) to authenticated;
grant execute on function internal.bulk_per(p_kind text) to service_role;
revoke all on function internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text) from public, anon, authenticated, service_role;
grant execute on function internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text) to authenticated;
grant execute on function internal.buy_event(b buys, p_user uuid, p_device uuid, p_action text, p_target text, p_games text[], p_removed integer, p_totals jsonb, p_lines jsonb, p_summary text) to service_role;
revoke all on function internal.buy_number(p_buy buys) from public, anon, authenticated, service_role;
grant execute on function internal.buy_number(p_buy buys) to authenticated;
grant execute on function internal.buy_number(p_buy buys) to service_role;
revoke all on function internal.buy_target_name(p_buy_id uuid) from public, anon, authenticated, service_role;
grant execute on function internal.buy_target_name(p_buy_id uuid) to authenticated;
grant execute on function internal.buy_target_name(p_buy_id uuid) to service_role;
revoke all on function internal.cant_upload_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function internal.cant_upload_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid) to authenticated;
grant execute on function internal.cant_upload_copy(p_lines uuid[], p_notes jsonb, p_from text, p_user uuid, p_device uuid) to service_role;
revoke all on function internal.cant_upload_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function internal.cant_upload_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid) to authenticated;
grant execute on function internal.cant_upload_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid) to service_role;
revoke all on function internal.cc_custom_sku(p_at timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function internal.cc_custom_sku(p_at timestamp with time zone) to authenticated;
grant execute on function internal.cc_custom_sku(p_at timestamp with time zone) to service_role;
revoke all on function internal.cc_custom_sku_day(p_day date) from public, anon, authenticated, service_role;
grant execute on function internal.cc_custom_sku_day(p_day date) to authenticated;
grant execute on function internal.cc_custom_sku_day(p_day date) to service_role;
revoke all on function internal.check_rate(p numeric) from public, anon, authenticated, service_role;
grant execute on function internal.check_rate(p numeric) to authenticated;
grant execute on function internal.check_rate(p numeric) to service_role;
revoke all on function internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text) from public, anon, authenticated, service_role;
grant execute on function internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text) to authenticated;
grant execute on function internal.collection_event(b buys, p_user uuid, p_device uuid, p_action text, p_games text[], p_added integer, p_removed integer, p_totals jsonb, p_lines jsonb, p_fields jsonb, p_summary text) to service_role;
revoke all on function internal.collection_for_write(p_buy_id uuid, p_device uuid, p_expected_version integer, p_content boolean) from public, anon, authenticated, service_role;
grant execute on function internal.collection_for_write(p_buy_id uuid, p_device uuid, p_expected_version integer, p_content boolean) to authenticated;
grant execute on function internal.collection_for_write(p_buy_id uuid, p_device uuid, p_expected_version integer, p_content boolean) to service_role;
revoke all on function internal.count_text(p_cards integer, p_bulk integer, p_word text) from public, anon, authenticated, service_role;
grant execute on function internal.count_text(p_cards integer, p_bulk integer, p_word text) to authenticated;
grant execute on function internal.count_text(p_cards integer, p_bulk integer, p_word text) to service_role;
revoke all on function internal.customer_key(p_name text) from public, anon, authenticated, service_role;
grant execute on function internal.customer_key(p_name text) to authenticated;
grant execute on function internal.customer_key(p_name text) to service_role;
revoke all on function internal.customer_name(p_name text) from public, anon, authenticated, service_role;
grant execute on function internal.customer_name(p_name text) to authenticated;
grant execute on function internal.customer_name(p_name text) to service_role;
revoke all on function internal.export_check(p_lines uuid[], p_matches jsonb, p_cant uuid[], p_file uuid) from public, anon, authenticated, service_role;
grant execute on function internal.export_check(p_lines uuid[], p_matches jsonb, p_cant uuid[], p_file uuid) to authenticated;
grant execute on function internal.export_check(p_lines uuid[], p_matches jsonb, p_cant uuid[], p_file uuid) to service_role;
revoke all on function internal.export_learn(p_matches jsonb, p_set_maps jsonb, p_file uuid, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function internal.export_learn(p_matches jsonb, p_set_maps jsonb, p_file uuid, p_user uuid) to authenticated;
grant execute on function internal.export_learn(p_matches jsonb, p_set_maps jsonb, p_file uuid, p_user uuid) to service_role;
revoke all on function internal.export_line_text(l buy_lines, p_qty integer) from public, anon, authenticated, service_role;
grant execute on function internal.export_line_text(l buy_lines, p_qty integer) to authenticated;
grant execute on function internal.export_line_text(l buy_lines, p_qty integer) to service_role;
revoke all on function internal.export_stamp(p_matches jsonb, p_file uuid, p_sku text) from public, anon, authenticated, service_role;
grant execute on function internal.export_stamp(p_matches jsonb, p_file uuid, p_sku text) to authenticated;
grant execute on function internal.export_stamp(p_matches jsonb, p_file uuid, p_sku text) to service_role;
revoke all on function internal.fix_line_rates(b buys) from public, anon, authenticated, service_role;
grant execute on function internal.fix_line_rates(b buys) to authenticated;
grant execute on function internal.fix_line_rates(b buys) to service_role;
revoke all on function internal.import_lines(b buys, p_lines jsonb, p_user uuid, p_device uuid, p_file text) from public, anon, authenticated, service_role;
grant execute on function internal.import_lines(b buys, p_lines jsonb, p_user uuid, p_device uuid, p_file text) to authenticated;
grant execute on function internal.import_lines(b buys, p_lines jsonb, p_user uuid, p_device uuid, p_file text) to service_role;
revoke all on function internal.line_counts(p_lines buy_lines[], OUT cards integer, OUT bulk integer) from public, anon, authenticated, service_role;
grant execute on function internal.line_counts(p_lines buy_lines[], OUT cards integer, OUT bulk integer) to authenticated;
grant execute on function internal.line_counts(p_lines buy_lines[], OUT cards integer, OUT bulk integer) to service_role;
revoke all on function internal.line_pct(l buy_lines, b buys, p_side text) from public, anon, authenticated, service_role;
grant execute on function internal.line_pct(l buy_lines, b buys, p_side text) to authenticated;
grant execute on function internal.line_pct(l buy_lines, b buys, p_side text) to service_role;
revoke all on function internal.lines_count_text(p_lines buy_lines[], p_word text) from public, anon, authenticated, service_role;
grant execute on function internal.lines_count_text(p_lines buy_lines[], p_word text) to authenticated;
grant execute on function internal.lines_count_text(p_lines buy_lines[], p_word text) to service_role;
revoke all on function internal.lines_totals(b buys, p_lines buy_lines[]) from public, anon, authenticated, service_role;
grant execute on function internal.lines_totals(b buys, p_lines buy_lines[]) to authenticated;
grant execute on function internal.lines_totals(b buys, p_lines buy_lines[]) to service_role;
revoke all on function internal.next_buy_number() from public, anon, authenticated, service_role;
grant execute on function internal.next_buy_number() to authenticated;
grant execute on function internal.next_buy_number() to service_role;
revoke all on function internal.norm_number(p text) from public, anon, authenticated, service_role;
grant execute on function internal.norm_number(p text) to authenticated;
grant execute on function internal.norm_number(p text) to service_role;
revoke all on function internal.rate_tiers() from public, anon, authenticated, service_role;
grant execute on function internal.rate_tiers() to authenticated;
grant execute on function internal.rate_tiers() to service_role;
revoke all on function internal.remember_customer() from public, anon, authenticated, service_role;
revoke all on function internal.restore_line(p_line_id uuid) from public, anon, authenticated, service_role;
grant execute on function internal.restore_line(p_line_id uuid) to authenticated;
grant execute on function internal.restore_line(p_line_id uuid) to service_role;
revoke all on function internal.same_card(l buy_lines, r buy_lines) from public, anon, authenticated, service_role;
grant execute on function internal.same_card(l buy_lines, r buy_lines) to authenticated;
grant execute on function internal.same_card(l buy_lines, r buy_lines) to service_role;
revoke all on function internal.same_line(a buy_lines, b buy_lines) from public, anon, authenticated, service_role;
grant execute on function internal.same_line(a buy_lines, b buy_lines) to authenticated;
grant execute on function internal.same_line(a buy_lines, b buy_lines) to service_role;
revoke all on function internal.scans_finished(p_device uuid, p_buy uuid, p_note text) from public, anon, authenticated, service_role;
grant execute on function internal.scans_finished(p_device uuid, p_buy uuid, p_note text) to authenticated;
grant execute on function internal.scans_finished(p_device uuid, p_buy uuid, p_note text) to service_role;
revoke all on function internal.strike_line(p_line_id uuid, p_n integer, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function internal.strike_line(p_line_id uuid, p_n integer, p_user uuid) to authenticated;
grant execute on function internal.strike_line(p_line_id uuid, p_n integer, p_user uuid) to service_role;
revoke all on function internal.unfix_line_rates(p_buy_id uuid) from public, anon, authenticated, service_role;
grant execute on function internal.unfix_line_rates(p_buy_id uuid) to authenticated;
grant execute on function internal.unfix_line_rates(p_buy_id uuid) to service_role;
revoke all on function public.backup_counts() from public, anon, authenticated, service_role;
grant execute on function public.backup_counts() to authenticated;
grant execute on function public.backup_counts() to service_role;
revoke all on function public.backup_export() from public, anon, authenticated, service_role;
grant execute on function public.backup_export() to authenticated;
grant execute on function public.backup_export() to service_role;
revoke all on function public.buy_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) from public, anon, authenticated, service_role;
grant execute on function public.buy_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to authenticated;
grant execute on function public.buy_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to service_role;
revoke all on function public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text) from public, anon, authenticated, service_role;
grant execute on function public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text) to authenticated;
grant execute on function public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text) to service_role;
revoke all on function public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer) from public, anon, authenticated, service_role;
grant execute on function public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer) to authenticated;
grant execute on function public.buy_mark_completed(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_complete boolean, p_expected_version integer) to service_role;
revoke all on function public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb, p_struck jsonb, p_restored jsonb) from public, anon, authenticated, service_role;
grant execute on function public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb, p_struck jsonb, p_restored jsonb) to authenticated;
grant execute on function public.buy_save_edits(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_lines jsonb, p_removed jsonb, p_struck jsonb, p_restored jsonb) to service_role;
revoke all on function public.buy_set_condition_check(p_buy_id uuid, p_flag boolean, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.buy_set_condition_check(p_buy_id uuid, p_flag boolean, p_user uuid, p_device uuid) to authenticated;
grant execute on function public.buy_set_condition_check(p_buy_id uuid, p_flag boolean, p_user uuid, p_device uuid) to service_role;
revoke all on function public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) from public, anon, authenticated, service_role;
grant execute on function public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to authenticated;
grant execute on function public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to service_role;
revoke all on function public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) from public, anon, authenticated, service_role;
grant execute on function public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to authenticated;
grant execute on function public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer, p_line_texts jsonb) to service_role;
revoke all on function public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer) from public, anon, authenticated, service_role;
grant execute on function public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer) to authenticated;
grant execute on function public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer) to service_role;
revoke all on function public.buys_in_range(p_from timestamp with time zone, p_to timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.buys_in_range(p_from timestamp with time zone, p_to timestamp with time zone) to authenticated;
grant execute on function public.buys_in_range(p_from timestamp with time zone, p_to timestamp with time zone) to service_role;
revoke all on function public.cant_upload_ensure() from public, anon, authenticated, service_role;
grant execute on function public.cant_upload_ensure() to authenticated;
grant execute on function public.cant_upload_ensure() to service_role;
revoke all on function public.cant_upload_note() from public, anon, authenticated, service_role;
grant execute on function public.cant_upload_note() to authenticated;
grant execute on function public.cant_upload_note() to service_role;
revoke all on function public.cc_candidates(p_wants jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cc_candidates(p_wants jsonb) to authenticated;
grant execute on function public.cc_candidates(p_wants jsonb) to service_role;
revoke all on function public.cc_categories() from public, anon, authenticated, service_role;
grant execute on function public.cc_categories() to authenticated;
grant execute on function public.cc_categories() to service_role;
revoke all on function public.cc_condition_word(p_condition text) from public, anon, authenticated, service_role;
grant execute on function public.cc_condition_word(p_condition text) to authenticated;
grant execute on function public.cc_condition_word(p_condition text) to service_role;
revoke all on function public.cc_current_file() from public, anon, authenticated, service_role;
grant execute on function public.cc_current_file() to authenticated;
grant execute on function public.cc_current_file() to service_role;
revoke all on function public.cc_products_by_id(p_ids text[]) from public, anon, authenticated, service_role;
grant execute on function public.cc_products_by_id(p_ids text[]) to authenticated;
grant execute on function public.cc_products_by_id(p_ids text[]) to service_role;
revoke all on function public.cc_products_load(p_file_id uuid, p_rows jsonb) from public, anon, authenticated, service_role;
grant execute on function public.cc_products_load(p_file_id uuid, p_rows jsonb) to authenticated;
grant execute on function public.cc_products_load(p_file_id uuid, p_rows jsonb) to service_role;
revoke all on function public.cc_products_search(p_text text, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.cc_products_search(p_text text, p_limit integer) to authenticated;
grant execute on function public.cc_products_search(p_text text, p_limit integer) to service_role;
revoke all on function public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text) from public, anon, authenticated, service_role;
grant execute on function public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text) to authenticated;
grant execute on function public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text) to service_role;
revoke all on function public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb) from public, anon, authenticated, service_role;
grant execute on function public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb) to authenticated;
grant execute on function public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb) to service_role;
revoke all on function public.collection_import(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_file text) from public, anon, authenticated, service_role;
grant execute on function public.collection_import(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_file text) to authenticated;
grant execute on function public.collection_import(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_file text) to service_role;
revoke all on function public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text) from public, anon, authenticated, service_role;
grant execute on function public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text) to authenticated;
grant execute on function public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text) to service_role;
revoke all on function public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer) from public, anon, authenticated, service_role;
grant execute on function public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer) to authenticated;
grant execute on function public.collection_reprice(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer) to service_role;
revoke all on function public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.collection_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.collection_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.collection_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric, p_offer_credit numeric, p_paid_price numeric, p_paid_method text, p_reason text) from public, anon, authenticated, service_role;
grant execute on function public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric, p_offer_credit numeric, p_paid_price numeric, p_paid_method text, p_reason text) to authenticated;
grant execute on function public.collection_set_status(p_buy_id uuid, p_status text, p_user uuid, p_device uuid, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_offer_cash numeric, p_offer_credit numeric, p_paid_price numeric, p_paid_method text, p_reason text) to service_role;
revoke all on function public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to authenticated;
grant execute on function public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text) to service_role;
revoke all on function public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer) from public, anon, authenticated, service_role;
grant execute on function public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer) to authenticated;
grant execute on function public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer) to service_role;
revoke all on function public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer) from public, anon, authenticated, service_role;
grant execute on function public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer) to authenticated;
grant execute on function public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer) to service_role;
revoke all on function public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text) from public, anon, authenticated, service_role;
grant execute on function public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text) to authenticated;
grant execute on function public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text) to service_role;
revoke all on function public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb, p_phone text) from public, anon, authenticated, service_role;
grant execute on function public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb, p_phone text) to authenticated;
grant execute on function public.confirm_buy(p_buy_id uuid, p_user uuid, p_customer_name text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_paid_price numeric, p_paid_method text, p_line_texts jsonb, p_phone text) to service_role;
revoke all on function public.day_complete(p_day date, p_game text, p_user uuid, p_device uuid, p_prices jsonb) from public, anon, authenticated, service_role;
grant execute on function public.day_complete(p_day date, p_game text, p_user uuid, p_device uuid, p_prices jsonb) to authenticated;
grant execute on function public.day_complete(p_day date, p_game text, p_user uuid, p_device uuid, p_prices jsonb) to service_role;
revoke all on function public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean, p_draft_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean, p_draft_id uuid) to authenticated;
grant execute on function public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean, p_draft_id uuid) to service_role;
revoke all on function public.draft_cancel(p_buy_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_cancel(p_buy_id uuid) to authenticated;
grant execute on function public.draft_cancel(p_buy_id uuid) to service_role;
revoke all on function public.draft_for_device(p_device uuid, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_for_device(p_device uuid, p_user uuid) to authenticated;
grant execute on function public.draft_for_device(p_device uuid, p_user uuid) to service_role;
revoke all on function public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid) to authenticated;
grant execute on function public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid) to service_role;
revoke all on function public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid) to authenticated;
grant execute on function public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid) to service_role;
revoke all on function public.draft_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid) to authenticated;
grant execute on function public.draft_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid) to service_role;
revoke all on function public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid) to authenticated;
grant execute on function public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid) to service_role;
revoke all on function public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid) to authenticated;
grant execute on function public.export_lines(p_target jsonb, p_matches jsonb, p_cant uuid[], p_set_maps jsonb, p_user uuid, p_device uuid) to service_role;
revoke all on function public.export_undo_day(p_day date, p_game text, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.export_undo_day(p_day date, p_game text, p_user uuid, p_device uuid) to authenticated;
grant execute on function public.export_undo_day(p_day date, p_game text, p_user uuid, p_device uuid) to service_role;
revoke all on function public.format_phone(p text) from public, anon, authenticated, service_role;
grant execute on function public.format_phone(p text) to authenticated;
grant execute on function public.format_phone(p text) to service_role;
revoke all on function public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean, p_struck boolean) from public, anon, authenticated, service_role;
grant execute on function public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean, p_struck boolean) to authenticated;
grant execute on function public.global_search(p_name text, p_number text, p_size integer, p_set text, p_all boolean, p_struck boolean) to service_role;
revoke all on function public.lock_acquire(p_buy_id uuid, p_device uuid, p_user uuid, p_force boolean) from public, anon, authenticated, service_role;
grant execute on function public.lock_acquire(p_buy_id uuid, p_device uuid, p_user uuid, p_force boolean) to authenticated;
grant execute on function public.lock_acquire(p_buy_id uuid, p_device uuid, p_user uuid, p_force boolean) to service_role;
revoke all on function public.lock_heartbeat(p_buy_id uuid, p_device uuid, p_user uuid) from public, anon, authenticated, service_role;
grant execute on function public.lock_heartbeat(p_buy_id uuid, p_device uuid, p_user uuid) to authenticated;
grant execute on function public.lock_heartbeat(p_buy_id uuid, p_device uuid, p_user uuid) to service_role;
revoke all on function public.lock_release(p_buy_id uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.lock_release(p_buy_id uuid, p_device uuid) to authenticated;
grant execute on function public.lock_release(p_buy_id uuid, p_device uuid) to service_role;
revoke all on function public.master_inventory_abort(p_file_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.master_inventory_abort(p_file_id uuid) to authenticated;
grant execute on function public.master_inventory_abort(p_file_id uuid) to service_role;
revoke all on function public.master_inventory_finish(p_file_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.master_inventory_finish(p_file_id uuid) to authenticated;
grant execute on function public.master_inventory_finish(p_file_id uuid) to service_role;
revoke all on function public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid) from public, anon, authenticated, service_role;
grant execute on function public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid) to authenticated;
grant execute on function public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid) to service_role;
revoke all on function public.master_pct(p_key text) from public, anon, authenticated, service_role;
grant execute on function public.master_pct(p_key text) to authenticated;
grant execute on function public.master_pct(p_key text) to service_role;
revoke all on function public.money_text(p numeric) from public, anon, authenticated, service_role;
grant execute on function public.money_text(p numeric) to authenticated;
grant execute on function public.money_text(p numeric) to service_role;
revoke all on function public.pct_text(p numeric) from public, anon, authenticated, service_role;
grant execute on function public.pct_text(p numeric) to authenticated;
grant execute on function public.pct_text(p numeric) to service_role;
revoke all on function public.project_create(p_name text, p_notes text, p_user uuid, p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.project_create(p_name text, p_notes text, p_user uuid, p_device uuid) to authenticated;
grant execute on function public.project_create(p_name text, p_notes text, p_user uuid, p_device uuid) to service_role;
revoke all on function public.project_import(p_name text, p_notes text, p_lines jsonb, p_user uuid, p_device uuid, p_file text) from public, anon, authenticated, service_role;
grant execute on function public.project_import(p_name text, p_notes text, p_lines jsonb, p_user uuid, p_device uuid, p_file text) to authenticated;
grant execute on function public.project_import(p_name text, p_notes text, p_lines jsonb, p_user uuid, p_device uuid, p_file text) to service_role;
revoke all on function public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_line_texts jsonb) from public, anon, authenticated, service_role;
grant execute on function public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_line_texts jsonb) to authenticated;
grant execute on function public.project_to_buy(p_buy_id uuid, p_user uuid, p_device uuid, p_customer_name text, p_phone text, p_paid_price numeric, p_paid_method text, p_notes text, p_cash_pct numeric, p_credit_pct numeric, p_expected_version integer, p_line_texts jsonb) to service_role;
revoke all on function public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text) from public, anon, authenticated, service_role;
grant execute on function public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text) to authenticated;
grant execute on function public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text) to service_role;
revoke all on function public.restore_rows(p_table text, p_rows jsonb, p_conflict text) from public, anon, authenticated, service_role;
grant execute on function public.restore_rows(p_table text, p_rows jsonb, p_conflict text) to service_role;
revoke all on function public.round_down_price(p numeric) from public, anon, authenticated, service_role;
grant execute on function public.round_down_price(p numeric) to authenticated;
grant execute on function public.round_down_price(p numeric) to service_role;
revoke all on function public.scan_answer(p_id uuid, p_phone uuid, p_price numeric) from public, anon, authenticated, service_role;
grant execute on function public.scan_answer(p_id uuid, p_phone uuid, p_price numeric) to authenticated;
grant execute on function public.scan_answer(p_id uuid, p_phone uuid, p_price numeric) to service_role;
revoke all on function public.scan_claim(p_id uuid, p_device uuid, p_kind text, p_buy_id uuid, p_draft_id uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_claim(p_id uuid, p_device uuid, p_kind text, p_buy_id uuid, p_draft_id uuid) to authenticated;
grant execute on function public.scan_claim(p_id uuid, p_device uuid, p_kind text, p_buy_id uuid, p_draft_id uuid) to service_role;
revoke all on function public.scan_pair(p_device uuid, p_phone uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_pair(p_device uuid, p_phone uuid) to authenticated;
grant execute on function public.scan_pair(p_device uuid, p_phone uuid) to service_role;
revoke all on function public.scan_phone_beat(p_device uuid, p_phone uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_phone_beat(p_device uuid, p_phone uuid) to authenticated;
grant execute on function public.scan_phone_beat(p_device uuid, p_phone uuid) to service_role;
revoke all on function public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text) from public, anon, authenticated, service_role;
grant execute on function public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text) to authenticated;
grant execute on function public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text) to service_role;
revoke all on function public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb) from public, anon, authenticated, service_role;
grant execute on function public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb) to authenticated;
grant execute on function public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb) to service_role;
revoke all on function public.scan_session_end(p_device uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_session_end(p_device uuid) to authenticated;
grant execute on function public.scan_session_end(p_device uuid) to service_role;
revoke all on function public.scan_session_touch(p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text) from public, anon, authenticated, service_role;
grant execute on function public.scan_session_touch(p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text) to authenticated;
grant execute on function public.scan_session_touch(p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text) to service_role;
revoke all on function public.scan_sessions_open() from public, anon, authenticated, service_role;
grant execute on function public.scan_sessions_open() to authenticated;
grant execute on function public.scan_sessions_open() to service_role;
revoke all on function public.scan_undo(p_id uuid, p_phone uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_undo(p_id uuid, p_phone uuid) to authenticated;
grant execute on function public.scan_undo(p_id uuid, p_phone uuid) to service_role;
revoke all on function public.scan_unpair(p_device uuid, p_phone uuid) from public, anon, authenticated, service_role;
grant execute on function public.scan_unpair(p_device uuid, p_phone uuid) to authenticated;
grant execute on function public.scan_unpair(p_device uuid, p_phone uuid) to service_role;
revoke all on function public.search_set_codes() from public, anon, authenticated, service_role;
grant execute on function public.search_set_codes() to authenticated;
grant execute on function public.search_set_codes() to service_role;
revoke all on function public.sentence(p text) from public, anon, authenticated, service_role;
grant execute on function public.sentence(p text) to authenticated;
grant execute on function public.sentence(p text) to service_role;
revoke all on function public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone) to authenticated;
grant execute on function public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone) to service_role;
revoke all on function public.status_label(p text) from public, anon, authenticated, service_role;
grant execute on function public.status_label(p text) to authenticated;
grant execute on function public.status_label(p text) to service_role;

-- ==========================================================================
-- Comments
-- ==========================================================================
comment on column public.buy_lines.custom_cash_pct is 'Set Rate: the card''s own Cash rate, or null';
comment on column public.buy_lines.custom_credit_pct is 'Set Rate: the card''s own Credit rate, or null';
comment on column public.buy_lines.cash_pct is 'The Cash rate kept on the card when its buy was confirmed / Paid/Ours';
comment on column public.buy_lines.credit_pct is 'The Credit rate kept on the card when its buy was confirmed / Paid/Ours';
comment on column public.buy_lines.bulk_kind is 'Bulk (docs/TEAM_FEEDBACK.md 5): which of the eight items, or null for a real card';
comment on column public.buy_lines.struck_at is 'Struck (owner, 2026-10-16): moved elsewhere, kept on the list crossed out; never exported, completed or searched, still in the totals';
comment on column public.buy_lines.struck_by is 'Who struck it';
comment on column public.scans.target_kind is 'The list it was sent to (decision 343): walk_in, or collection with target_buy_id.';
comment on column public.scans.target_draft_id is 'The walk-in buy (draft) it was sent to (decision 350).';

-- ==========================================================================
-- Storage: the master-inventory bucket and its policies (0002, 0023)
-- ==========================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('master-inventory', 'master-inventory', false, 52428800, null)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy "store: delete master inventory" on storage.objects as permissive for delete to authenticated
  using (bucket_id = 'master-inventory'::text);
create policy "store: read master inventory" on storage.objects as permissive for select to authenticated
  using (bucket_id = 'master-inventory'::text);
create policy "store: replace master inventory" on storage.objects as permissive for update to authenticated
  using (bucket_id = 'master-inventory'::text)
  with check (bucket_id = 'master-inventory'::text);
create policy "store: upload master inventory" on storage.objects as permissive for insert to authenticated
  with check (bucket_id = 'master-inventory'::text);

-- ==========================================================================
-- Realtime (0002, 0035)
-- ==========================================================================
alter table public.buy_lines replica identity full;
alter publication supabase_realtime add table public.api_usage, public.buy_lines, public.buys, public.collection_locks, public.events, public.master_inventory_files, public.scan_sessions, public.scans, public.settings, public.staff_users;

-- ==========================================================================
-- Starting rows (not from dev: what the old migrations seeded)
-- ==========================================================================
-- The master percentages start at the store's 33.34 / 66.68 (decision 333; 0001 seeded 33 / 66).
insert into public.settings (key, value) values ('cash_pct', '33.34'), ('credit_pct', '66.68') on conflict (key) do nothing;
-- 0028: the Can't upload cards collection.
select public.cant_upload_ensure();
