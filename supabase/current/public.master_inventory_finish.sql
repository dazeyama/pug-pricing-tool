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

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
