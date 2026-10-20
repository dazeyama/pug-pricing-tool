-- Only the current Master Crystal Inventory file is kept (owner, 2026-09-30):
-- no previous copies at all. An upload replaces the file; master_inventory_add
-- (0023) now removes every other row and returns their storage paths, for the
-- app to delete the files.

create or replace function public.master_inventory_add(
  p_storage_path      text,
  p_original_filename text,
  p_size_bytes        integer,
  p_row_count         integer,
  p_columns           text[],
  p_uploaded_by       uuid
) returns text[]
language plpgsql
set search_path = public
as $$
declare
  pruned text[];
begin
  -- Two computers uploading at once take turns, so exactly one ends current.
  perform pg_advisory_xact_lock(hashtext('master_inventory_files'));

  update master_inventory_files set is_current = false where is_current;

  insert into master_inventory_files
    (storage_path, original_filename, size_bytes, row_count, columns, uploaded_by, is_current)
  values
    (p_storage_path, p_original_filename, p_size_bytes, p_row_count, p_columns, p_uploaded_by, true);

  -- Everything but the file just added goes.
  with doomed as (
    select id from master_inventory_files where not is_current
  ), gone as (
    delete from master_inventory_files m
    using doomed d
    where m.id = d.id
    returning m.storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into pruned from gone;

  return pruned;
end;
$$;
