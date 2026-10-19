CREATE OR REPLACE FUNCTION public.scan_claim(p_id uuid, p_device uuid, p_kind text DEFAULT NULL::text, p_buy_id uuid DEFAULT NULL::uuid, p_draft_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v jsonb;
begin
  update scans c
     set status = case when status in ('undo', 'undoing') then 'undoing' else 'pricing' end, handled_at = now()
   where c.id = p_id and c.session_device_id = p_device
     and (c.target_kind is null
          or (p_kind is not null and c.target_kind = p_kind and c.target_buy_id is not distinct from p_buy_id)
          or (p_kind is null and exists (select 1 from scan_sessions s
                                          where s.device_id = p_device and s.target_kind = c.target_kind
                                            and s.buy_id is not distinct from c.target_buy_id)))
     -- A walk-in scan, by the buy it was sent to, when the app names its own (decision 350); an
     -- app that names none (the one before this) as before, and an Undo whatever the buy.
     and (c.target_kind is distinct from 'walk_in' or c.target_draft_id is null or p_draft_id is null
          or c.target_draft_id = p_draft_id or c.status in ('undo', 'undoing'))
     and (c.status in ('sent', 'undo')
          or (c.status in ('pricing', 'undoing') and c.handled_at < now() - interval '1 minute'))
  returning to_jsonb(c.*) into v;
  return v;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
