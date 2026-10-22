CREATE OR REPLACE FUNCTION public.draft_set_auto_rates(p_device uuid, p_on boolean, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  v_buy := draft_for_device(p_device, p_user);
  update buys
     set auto_rates = coalesce(p_on, false),
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_buy and auto_rates is distinct from coalesce(p_on, false);
  return v_buy;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
