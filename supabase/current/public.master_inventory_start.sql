CREATE OR REPLACE FUNCTION public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  -- A user, always (decision 412): the upload is in the Changelog under their name.
  if p_uploaded_by is null then raise exception 'no_user'; end if;
  insert into master_inventory_files
    (storage_path, original_filename, size_bytes, row_count, columns, uploaded_by, is_current)
  values
    (p_storage_path, p_original_filename, p_size_bytes, p_row_count, p_columns, p_uploaded_by, false)
  returning id into v_id;
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
