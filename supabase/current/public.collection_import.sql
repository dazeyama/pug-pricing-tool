CREATE OR REPLACE FUNCTION public.collection_import(p_buy_id uuid, p_lines jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_file text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  return import_lines(b, p_lines, p_user, p_device, p_file);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
