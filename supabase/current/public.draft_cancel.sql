CREATE OR REPLACE FUNCTION public.draft_cancel(p_buy_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  delete from buys where id = p_buy_id and status = 'draft';
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
