-- Postgres write functions (spec 6.2). Later phases add the buy and
-- collection functions here in new migration files.

-- ---------------------------------------------------------------------------
-- master_inventory_add: record a Crystal Commerce CSV the browser has just
-- uploaded to Storage, in one transaction:
--   1. the previous current file stops being current;
--   2. the new file becomes current;
--   3. anything past the 5 most recent is deleted.
-- Returns the Storage paths of the deleted rows, for the browser to remove
-- the files themselves (Storage objects can't be deleted from SQL).
-- ---------------------------------------------------------------------------
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

  with doomed as (
    select id
    from master_inventory_files
    order by is_current desc, uploaded_at desc, id
    offset 5
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

revoke execute on function public.master_inventory_add(text, text, integer, integer, text[], uuid)
  from public, anon;
grant execute on function public.master_inventory_add(text, text, integer, integer, text[], uuid)
  to authenticated;
