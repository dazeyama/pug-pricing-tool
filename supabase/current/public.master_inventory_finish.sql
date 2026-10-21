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

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
