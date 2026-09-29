-- PUG Pricing Tool: every table in spec Section 6.1.
-- IDs are uuid default gen_random_uuid(); timestamps are timestamptz default now().

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- staff_users: colour-coded staff profiles (the header "user" dropdown).
-- "Delete" sets active = false, so past buys keep their name.
-- ---------------------------------------------------------------------------
create table public.staff_users (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (btrim(name) <> ''),
  color       text not null check (color in (
                'pal-crimson', 'pal-orange', 'pal-amber', 'pal-olive', 'pal-green', 'pal-teal',
                'pal-cyan', 'pal-blue', 'pal-indigo', 'pal-violet', 'pal-magenta', 'pal-slate')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- Unique among active users, case-insensitive.
create unique index staff_users_active_name_key
  on public.staff_users (lower(btrim(name))) where active;

-- ---------------------------------------------------------------------------
-- devices: one row per browser. The id is generated in the browser.
-- ---------------------------------------------------------------------------
create table public.devices (
  id            uuid primary key,
  label         text not null check (btrim(label) <> ''),
  last_seen_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- buys: walk-in buys and collections.
-- ---------------------------------------------------------------------------
create table public.buys (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('walk_in', 'collection')),
  status           text not null,
  customer_name    text,
  phone            text check (phone is null or phone ~ '^[0-9]{10}$'),
  notes            text not null default '',
  draft_device_id  uuid references public.devices (id),
  created_at       timestamptz not null default now(),
  created_by       uuid references public.staff_users (id),
  updated_at       timestamptz not null default now(),
  last_edited_by   uuid references public.staff_users (id),
  confirmed_at     timestamptz,
  confirmed_by     uuid references public.staff_users (id),
  paid_at          timestamptz,
  cash_pct         numeric(5,2) check (cash_pct between 0 and 100),
  credit_pct       numeric(5,2) check (credit_pct between 0 and 100),
  version          integer not null default 1,
  constraint buys_status_for_kind check (
       (kind = 'walk_in'    and status in ('draft', 'confirmed'))
    or (kind = 'collection' and status in ('processing', 'priced', 'paid'))),
  constraint buys_collection_needs_name_phone check (
    kind <> 'collection' or (customer_name is not null and phone is not null))
);
-- One draft per device.
create unique index buys_one_draft_per_device
  on public.buys (draft_device_id) where status = 'draft';
create index buys_kind_status on public.buys (kind, status);
create index buys_confirmed_at on public.buys (confirmed_at) where status = 'confirmed';

-- ---------------------------------------------------------------------------
-- buy_lines: quantity x one exact printing, finish, condition and unit price.
-- ---------------------------------------------------------------------------
create table public.buy_lines (
  id                  uuid primary key default gen_random_uuid(),
  buy_id              uuid not null references public.buys (id) on delete cascade,
  position            integer not null,
  game                text not null check (game in ('mtg', 'pokemon')),
  lang                text not null default 'en' check (lang in ('en', 'ja')),
  name                text not null,
  name_key            text not null,
  set_code            text not null,
  set_name            text,
  source_set_id       text,
  collector_number    text not null,
  printed_size        integer,
  rarity              text,
  finish              text not null check (finish in ('nonfoil', 'foil', 'etched', 'normal', 'holo', 'reverse')),
  first_edition       boolean not null default false,
  treatments          jsonb not null default '[]',
  condition           text not null default 'NM' check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  quantity            integer not null check (quantity > 0),
  unit_price          numeric(10,2) not null check (unit_price >= 0),
  market_price        numeric(10,2),
  price_source        text not null check (price_source in ('justtcg', 'scryfall_fallback', 'tcgdex_fallback', 'manual')),
  price_snapshot      jsonb,
  priced_at           timestamptz,
  scryfall_id         text,
  oracle_id           text,
  tcgdex_id           text,
  tcgplayer_id        text,
  justtcg_card_id     text,
  justtcg_variant_id  text,
  image_url           text,
  created_at          timestamptz not null default now()
);
create index buy_lines_buy on public.buy_lines (buy_id, position);
create index buy_lines_name_key_trgm on public.buy_lines using gin (name_key extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- events: the changelog. Append-only; user names and colours are frozen.
-- target_id has no foreign key so entries outlive what they describe.
-- ---------------------------------------------------------------------------
create table public.events (
  seq               bigserial primary key,
  at                timestamptz not null default now(),
  staff_user_id     uuid,
  staff_user_name   text,
  staff_user_color  text,
  device_id         uuid,
  kind              text not null check (kind in ('buy', 'collection', 'app')),
  action            text not null,
  target_id         uuid,
  target_name       text,
  games             text[] not null default '{}',
  added             integer not null default 0,
  removed           integer not null default 0,
  totals            jsonb,
  lines             jsonb not null default '[]',
  fields            jsonb not null default '[]',
  summary           text not null default ''
);
create index events_target on public.events (target_id);
create index events_at on public.events (at desc);

-- ---------------------------------------------------------------------------
-- settings: key/value. cash_pct and credit_pct start at 33 / 66.
-- ---------------------------------------------------------------------------
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.staff_users (id)
);
insert into public.settings (key, value) values
  ('cash_pct', '33'),
  ('credit_pct', '66');

-- ---------------------------------------------------------------------------
-- secrets: API keys. RLS on with no policies (0002), so only Edge Functions
-- using the secret key can read or write it.
-- ---------------------------------------------------------------------------
create table public.secrets (
  provider    text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- api_usage: one row (id = 1), written by the `prices` Edge Function.
-- ---------------------------------------------------------------------------
create table public.api_usage (
  id             integer primary key default 1 check (id = 1),
  plan           text,
  daily_used     integer,
  daily_limit    integer,
  monthly_used   integer,
  monthly_limit  integer,
  rate_limit     integer,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- price_cache / price_map: written by the `prices` Edge Function.
-- ---------------------------------------------------------------------------
create table public.price_cache (
  key         text primary key,            -- JustTCG card id
  game        text not null,
  payload     jsonb not null,              -- the JustTCG card with all variants
  fetched_at  timestamptz not null default now()
);

create table public.price_map (
  source_key       text primary key,       -- e.g. mtg:scryfall:<id>, pokemon:en:<tcgdex id>
  justtcg_card_id  text,                   -- null = confirmed no match (retried after 7 days)
  resolved_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- master_inventory_files: the Crystal Commerce CSV uploads (latest 5 kept).
-- ---------------------------------------------------------------------------
create table public.master_inventory_files (
  id                 uuid primary key default gen_random_uuid(),
  storage_path       text not null unique,
  original_filename  text not null,
  size_bytes         integer not null,
  row_count          integer not null,
  columns            text[] not null default '{}',
  uploaded_at        timestamptz not null default now(),
  uploaded_by        uuid references public.staff_users (id),
  is_current         boolean not null default false
);
-- Exactly one current file.
create unique index master_inventory_one_current
  on public.master_inventory_files (is_current) where is_current;

-- ---------------------------------------------------------------------------
-- collection_locks: one computer edits a collection at a time.
-- A lock is stale when heartbeat_at is older than 60s.
-- ---------------------------------------------------------------------------
create table public.collection_locks (
  buy_id         uuid primary key references public.buys (id) on delete cascade,
  device_id      uuid not null references public.devices (id),
  staff_user_id  uuid references public.staff_users (id),
  acquired_at    timestamptz not null default now(),
  heartbeat_at   timestamptz not null default now()
);
