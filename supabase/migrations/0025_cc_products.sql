-- Export Phase E1 (docs/EXPORT_FUNCTION.md 6.1, 6.7): the Master Crystal
-- Inventory's products in a table the matcher can search, loaded at upload.
--
-- As built: the products belong to the upload's master_inventory_files row,
-- so an upload now runs in steps: master_inventory_start (the row, not yet
-- current) → cc_products_load in batches → master_inventory_finish (current;
-- the old file's row goes, and its products with it) or, on failure,
-- master_inventory_abort. master_inventory_add stays for the older build.

alter table public.master_inventory_files add column products_loaded integer;

create table public.cc_products (
  file_id       uuid not null references public.master_inventory_files (id) on delete cascade,
  product_id    text not null,
  cc_id         text,
  product_name  text not null,          -- exactly as in the CSV
  category      text not null,          -- exactly as in the CSV
  base_key      text not null,          -- the base name folded (nameKey)
  bracket       text,                   -- "2090", "M3C"…
  foil_kind     text,                   -- "Foil", "Foil Etched", "Surge Foil"…
  variants      text[] not null default '{}',
  catalog_path  text not null default '',
  primary key (file_id, product_id)
);
create index cc_products_category_base on public.cc_products (file_id, category, base_key);
create index cc_products_base on public.cc_products (file_id, base_key);
create index cc_products_base_trgm on public.cc_products using gin (base_key extensions.gin_trgm_ops);

alter table public.cc_products enable row level security;
revoke all on public.cc_products from anon;
grant select on public.cc_products to authenticated;
create policy "store: read" on public.cc_products for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- The upload, in steps.
-- ---------------------------------------------------------------------------
create or replace function public.master_inventory_start(
  p_storage_path      text,
  p_original_filename text,
  p_size_bytes        integer,
  p_row_count         integer,
  p_columns           text[],
  p_uploaded_by       uuid
) returns uuid
language plpgsql
set search_path = public
as $$
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
$$;

-- A batch of parsed products for an upload that isn't current yet. Security
-- definer: the store's role can only read cc_products.
create or replace function public.cc_products_load(p_file_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- Make the upload current: every other file's row goes (their products with
-- them), and their storage paths come back for the app to delete.
create or replace function public.master_inventory_finish(p_file_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

-- A failed upload: its row (and any products loaded) goes; the stored file's
-- path comes back for the app to delete. The current file is untouched.
create or replace function public.master_inventory_abort(p_file_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from master_inventory_files where id = p_file_id and not is_current returning storage_path into v_path;
  return v_path;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pokémon days can't be exported (day_mark, 0019, with that check added).
-- ---------------------------------------------------------------------------
create or replace function public.day_mark(
  p_day      date,
  p_game     text,
  p_user     uuid,
  p_device   uuid,
  p_complete boolean
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  -- Pokémon can't be exported yet (owner, 2026-09-30; export spec 1.3).
  -- Putting a Pokémon day back to Paid/Ours stays allowed.
  if p_complete and p_game = 'pokemon' then
    raise exception 'pokemon_export_unavailable';
  end if;
  -- The day isn't over: buys confirmed later would miss the export (owner,
  -- 2026-09-30). Putting a day back to Paid/Ours is always allowed.
  if p_complete and p_day >= (now() at time zone 'America/Los_Angeles')::date then
    raise exception 'day_not_over';
  end if;

  select array_agg(distinct b.id) into v_ids
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game
     and (l.completed_at is null) = p_complete;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  if p_complete then
    update buy_lines set completed_at = now(), completed_by = p_user
     where buy_id = any(v_ids) and game = p_game and completed_at is null;
  else
    update buy_lines set completed_at = null, completed_by = null
     where buy_id = any(v_ids) and game = p_game and completed_at is not null;
  end if;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy',
          case when p_complete then 'day_exported' else 'day_unexported' end,
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status',
            'before', case when p_complete then 'Paid/Ours' else 'Completed' end,
            'after', case when p_complete then 'Completed' else 'Paid/Ours' end)),
          case when p_complete
               then format('%s %s buy%s exported and marked Completed.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end)
               else format('%s %s buy%s marked Paid/Ours again.', v_count, v_game,
                           case when v_count = 1 then '' else 's' end) end);
  return v_count;
end;
$$;

revoke execute on function
  public.master_inventory_start(text, text, integer, integer, text[], uuid),
  public.cc_products_load(uuid, jsonb),
  public.master_inventory_finish(uuid),
  public.master_inventory_abort(uuid)
from public, anon;
grant execute on function
  public.master_inventory_start(text, text, integer, integer, text[], uuid),
  public.cc_products_load(uuid, jsonb),
  public.master_inventory_finish(uuid),
  public.master_inventory_abort(uuid)
to authenticated;
