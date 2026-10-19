CREATE OR REPLACE FUNCTION public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v scan_sessions;
  v_id uuid;
  v_client uuid := case when p_scan ->> 'client_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then (p_scan ->> 'client_id')::uuid end;
begin
  -- Sent before (a retry after no answer in time): the scan already saved, never a second copy.
  if v_client is not null then
    select id into v_id from scans where phone_device_id = p_phone and client_id = v_client;
    if v_id is not null then
      return v_id;
    end if;
  end if;
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
  -- The list it's for (decision 343): only that list claims it.
  insert into scans (session_device_id, phone_device_id, scryfall_id, name, set_code, collector_number,
                     finish, condition, tier, client_id, target_kind, target_buy_id, target_draft_id)
  values (p_device, p_phone, btrim(p_scan ->> 'scryfall_id'), coalesce(p_scan ->> 'name', ''),
          coalesce(p_scan ->> 'set_code', ''), coalesce(p_scan ->> 'collector_number', ''),
          p_scan ->> 'finish', p_scan ->> 'condition', coalesce(p_scan ->> 'tier', '1')::smallint, v_client,
          v.target_kind, v.buy_id,
          -- A walk-in's buy, as it is now (decision 350).
          -- Opened now if there isn't one yet, so every walk-in scan knows its buy.
          case when v.target_kind = 'walk_in' then draft_for_device(p_device, v.staff_user_id) end)
  on conflict (phone_device_id, client_id) where client_id is not null do nothing
  returning id into v_id;
  -- The same scan arriving twice at once (the retry while the first was still on its way).
  if v_id is null then
    select id into v_id from scans where phone_device_id = p_phone and client_id = v_client;
    return v_id;
  end if;
  update scan_sessions set phone_seen_at = now() where device_id = p_device;
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
