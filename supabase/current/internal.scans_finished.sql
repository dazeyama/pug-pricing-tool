CREATE OR REPLACE FUNCTION internal.scans_finished(p_device uuid, p_buy uuid, p_note text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'internal'
AS $function$
  update scans set status = 'failed', note = p_note, handled_at = now()
   where p_device is not null and session_device_id = p_device and target_kind = 'walk_in'
     and (target_draft_id = p_buy or target_draft_id is null)
     and status in ('sent', 'pricing', 'needs_price');
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
