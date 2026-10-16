CREATE OR REPLACE FUNCTION public.master_inventory_abort(p_file_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  v_path text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from master_inventory_files where id = p_file_id and not is_current returning storage_path into v_path;
  return v_path;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
