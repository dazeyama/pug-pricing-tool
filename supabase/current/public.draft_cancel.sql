CREATE OR REPLACE FUNCTION public.draft_cancel(p_buy_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  -- Its scans not added are left out, and the phone says so (decision 350).
  select internal.scans_finished((select draft_device_id from buys where id = p_buy_id and status = 'draft'), p_buy_id,
                                 'The buy was cancelled: scan it again for the next buy');
  delete from buys where id = p_buy_id and status = 'draft';
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
