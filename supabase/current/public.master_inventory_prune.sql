CREATE OR REPLACE FUNCTION public.master_inventory_prune(p_file_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
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
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
