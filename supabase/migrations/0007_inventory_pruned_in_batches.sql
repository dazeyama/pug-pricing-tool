-- A new Master Crystal Inventory over the old one timed out (decision 414): "Saving the upload failed:
-- canceling statement due to statement timeout". master_inventory_finish dropped the old file's row, and with it,
-- in the same statement, its ~152,000 products: 18.9 s on dev with both files loaded, over the 8 s the app's
-- statements get. Now:
--   master_inventory_finish makes the new file current and drops only the files before it that have no products
--     left (instant); same signature and result, so the live build keeps working (its old products stay until
--     the next upload from this build);
--   master_inventory_prune deletes 5,000 products a call (a first call took 4.8 s for 20,000 on dev, later ones
--     about 1 s) from the files before the current one, or from one unfinished upload (p_file_id, the app's
--     undo of a failed upload), then drops whichever of those files are empty, and says whether any are left.
-- The new file becomes current first, so exports never match against a half-deleted inventory.
-- Two uploads at once: once a newer one is current, an older one still loading is refused (cc_products_load and
--   master_inventory_finish raise 'upload_gone', as when the old finish dropped its row) and its products are
--   cleared with the rest, so it can never become current half-cleared.

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
  -- An upload started before the current file is over (decision 414): its products are being cleared.
  if not exists (select 1 from master_inventory_files f
                  where f.id = p_file_id and not f.is_current
                    and not exists (select 1 from master_inventory_files c where c.is_current and c.uploaded_at > f.uploaded_at)) then
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
  -- Two uploads at once: the one started first can't finish after the other (decision 414).
  if exists (select 1 from master_inventory_files c, master_inventory_files f
              where f.id = p_file_id and c.is_current and c.id <> f.id and c.uploaded_at > f.uploaded_at) then
    raise exception 'upload_gone';
  end if;
  update master_inventory_files set is_current = false where is_current;
  update master_inventory_files
     set is_current = true,
         products_loaded = (select count(*) from cc_products where file_id = p_file_id)
   where id = p_file_id;
  -- The files before it go once their products are gone: master_inventory_prune, in batches (decision 414).
  with gone as (
    delete from master_inventory_files f
     where f.id <> p_file_id
       and f.uploaded_at < (select uploaded_at from master_inventory_files where id = p_file_id)
       and not exists (select 1 from cc_products p where p.file_id = f.id)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into pruned from gone;
  -- The Changelog (decision 412), under the user who started the upload.
  perform internal.settings_event(f.uploaded_by, null, 'inventory_uploaded', 'Master Crystal Inventory', '[]'::jsonb,
    format('Master Crystal Inventory uploaded: %s, %s products.', f.original_filename, f.products_loaded))
    from master_inventory_files f where f.id = p_file_id;
  return pruned;
end;
$function$;

-- One batch of an old or abandoned file's products (decision 414): 5,000, well under the 8 s limit.
-- No file: the files uploaded before the current one. A file: that one, if it isn't current.
-- Returns {deleted, paths (the storage files to remove), done (none of those files left)}.
create function public.master_inventory_prune(p_file_id uuid DEFAULT NULL::uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_files uuid[];
  v_deleted integer;
  v_paths text[];
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext('master_inventory_files'));
  if p_file_id is null then
    select coalesce(array_agg(f.id), '{}') into v_files
      from master_inventory_files f, master_inventory_files c
     where c.is_current and not f.is_current and f.uploaded_at < c.uploaded_at;
  else
    select coalesce(array_agg(id), '{}') into v_files
      from master_inventory_files where id = p_file_id and not is_current;
  end if;
  with d as (
    delete from cc_products p
     using (select file_id, product_id from cc_products where file_id = any(v_files) limit 5000) x
     where p.file_id = x.file_id and p.product_id = x.product_id
    returning 1
  )
  select count(*) into v_deleted from d;
  with gone as (
    delete from master_inventory_files f
     where f.id = any(v_files) and not exists (select 1 from cc_products p where p.file_id = f.id)
    returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into v_paths from gone;
  return jsonb_build_object('deleted', v_deleted, 'paths', to_jsonb(v_paths),
    'done', not exists (select 1 from master_inventory_files where id = any(v_files)));
end;
$$;
revoke all on function public.master_inventory_prune(uuid) from public, anon;
grant execute on function public.master_inventory_prune(uuid) to authenticated, service_role;
