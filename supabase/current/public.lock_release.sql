CREATE OR REPLACE FUNCTION public.lock_release(p_buy_id uuid, p_device uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  delete from collection_locks where buy_id = p_buy_id and device_id = p_device;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
