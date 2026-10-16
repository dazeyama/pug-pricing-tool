CREATE OR REPLACE FUNCTION public.lock_heartbeat(p_buy_id uuid, p_device uuid, p_user uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
begin
  update collection_locks
     set heartbeat_at = now(), staff_user_id = coalesce(p_user, staff_user_id)
   where buy_id = p_buy_id and device_id = p_device;
  return found;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
