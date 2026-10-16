CREATE OR REPLACE FUNCTION public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scan_sessions;
  v_id uuid;
begin
  select * into v from scan_sessions where device_id = p_device;
  if not found then
    raise exception 'session_gone';
  end if;
  if v.phone_device_id is distinct from p_phone then
    raise exception 'not_paired';
  end if;
  if v.heartbeat_at < now() - interval '60 seconds' then
    raise exception 'session_stale';
  end if;
  if not v.can_add then
    raise exception 'cannot_add';
  end if;
  if coalesce(btrim(p_scan ->> 'scryfall_id'), '') = ''
     or coalesce(p_scan ->> 'finish', '') not in ('nonfoil', 'foil', 'etched')
     or coalesce(p_scan ->> 'condition', '') not in ('NM', 'LP', 'MP', 'HP', 'DMG')
     or coalesce(p_scan ->> 'tier', '1') !~ '^[123]$' then
    raise exception 'bad_scan';
  end if;

  delete from scans where created_at < now() - interval '7 days';
  insert into scans (session_device_id, phone_device_id, scryfall_id, name, set_code, collector_number,
                     finish, condition, tier)
  values (p_device, p_phone, btrim(p_scan ->> 'scryfall_id'), coalesce(p_scan ->> 'name', ''),
          coalesce(p_scan ->> 'set_code', ''), coalesce(p_scan ->> 'collector_number', ''),
          p_scan ->> 'finish', p_scan ->> 'condition', coalesce(p_scan ->> 'tier', '1')::smallint)
  returning id into v_id;
  update scan_sessions set phone_seen_at = now() where device_id = p_device;
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
