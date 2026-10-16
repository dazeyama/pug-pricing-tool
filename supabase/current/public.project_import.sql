CREATE OR REPLACE FUNCTION public.project_import(p_name text, p_notes text, p_lines jsonb, p_user uuid, p_device uuid, p_file text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
  b    buys;
begin
  v_id := project_create(p_name, p_notes, p_user, p_device);
  select * into b from buys where id = v_id;
  perform import_lines(b, p_lines, p_user, p_device, p_file);
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
