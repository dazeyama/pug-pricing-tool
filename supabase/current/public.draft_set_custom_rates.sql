CREATE OR REPLACE FUNCTION public.draft_set_custom_rates(p_device uuid, p_cash numeric, p_credit numeric, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  v_buy := draft_for_device(p_device, p_user);
  update buys
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_buy;
  return v_buy;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
