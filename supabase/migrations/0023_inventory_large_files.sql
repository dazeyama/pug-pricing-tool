-- The real Crystal Commerce export is 40 MB and more, not the 2-5 MB first
-- expected (owner, 2026-09-30). The app now stores it gzipped, and on the
-- Free plan (1 GB of storage, 50 MB per file) keeps only the current file
-- and the one before it, not five.

-- The bucket takes a file up to Supabase's Free-plan limit (was 20 MB).
update storage.buckets set file_size_limit = 52428800 where id = 'master-inventory';

-- master_inventory_add (0003), keeping two files instead of five; it returns
-- the storage paths of the rows it removed, for the app to delete.
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
    offset 2
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
