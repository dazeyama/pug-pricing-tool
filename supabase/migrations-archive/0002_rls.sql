-- Row Level Security (spec 4.4), table grants, the master-inventory Storage
-- bucket, and the Realtime publication (spec 6.3).
--
-- The store signs in as one Auth account, so the `authenticated` role is
-- "the store". Public sign-ups are off in both projects, which is what makes
-- that safe. `anon` (signed out) gets nothing.

-- ---------------------------------------------------------------------------
-- RLS on every table.
-- ---------------------------------------------------------------------------
alter table public.staff_users            enable row level security;
alter table public.devices                enable row level security;
alter table public.buys                   enable row level security;
alter table public.buy_lines              enable row level security;
alter table public.events                 enable row level security;
alter table public.settings               enable row level security;
alter table public.secrets                enable row level security;
alter table public.api_usage              enable row level security;
alter table public.price_cache            enable row level security;
alter table public.price_map              enable row level security;
alter table public.master_inventory_files enable row level security;
alter table public.collection_locks       enable row level security;

-- Explicit grants: newer Supabase projects don't expose new tables to the
-- Data API roles automatically, and older ones grant anon too much.
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- ---------------------------------------------------------------------------
-- The app's own tables: the store has full access.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.staff_users, public.devices, public.buys, public.buy_lines,
  public.settings, public.master_inventory_files, public.collection_locks
  to authenticated;

create policy "store: full access" on public.staff_users
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.devices
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.buys
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.buy_lines
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.settings
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.master_inventory_files
  for all to authenticated using (true) with check (true);
create policy "store: full access" on public.collection_locks
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- events: append-only. The store can read and add entries, never change or
-- remove them. (A backup restore, Phase 10, runs as a server-side function.)
-- ---------------------------------------------------------------------------
grant select, insert on public.events to authenticated;
grant usage, select on sequence public.events_seq_seq to authenticated;

create policy "store: read" on public.events
  for select to authenticated using (true);
create policy "store: append" on public.events
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Written only by the `prices` Edge Function (service role); the app reads.
-- ---------------------------------------------------------------------------
grant select on public.api_usage, public.price_cache, public.price_map to authenticated;

create policy "store: read" on public.api_usage
  for select to authenticated using (true);
create policy "store: read" on public.price_cache
  for select to authenticated using (true);
create policy "store: read" on public.price_map
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- secrets: RLS on, NO policies, no grants. Only the secret (service-role) key
-- reaches it, from the `secrets` and `prices` Edge Functions.
-- ---------------------------------------------------------------------------
revoke all on public.secrets from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: the private `master-inventory` bucket for Crystal Commerce CSVs.
-- 20 MB per file, matching the upload check in Settings.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('master-inventory', 'master-inventory', false, 20971520)
on conflict (id) do nothing;

create policy "store: read master inventory" on storage.objects
  for select to authenticated using (bucket_id = 'master-inventory');
create policy "store: upload master inventory" on storage.objects
  for insert to authenticated with check (bucket_id = 'master-inventory');
create policy "store: replace master inventory" on storage.objects
  for update to authenticated
  using (bucket_id = 'master-inventory') with check (bucket_id = 'master-inventory');
create policy "store: delete master inventory" on storage.objects
  for delete to authenticated using (bucket_id = 'master-inventory');

-- ---------------------------------------------------------------------------
-- Realtime (spec 6.3). buy_lines sends whole rows on delete, so a viewer can
-- tell which buy lost a line.
-- ---------------------------------------------------------------------------
alter table public.buy_lines replica identity full;

alter publication supabase_realtime add table
  public.buys, public.buy_lines, public.collection_locks,
  public.staff_users, public.settings, public.master_inventory_files, public.api_usage;
