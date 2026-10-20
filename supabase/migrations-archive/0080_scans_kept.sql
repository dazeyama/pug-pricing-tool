-- 0080: leaving the price screen keeps the scans waiting for it (DESIGN_SPEC decision 343).
--
-- Scans hung off the computer's scan_sessions row (0069, on delete cascade), and
-- scan_session_end deletes that row, so every card the phone had chimed for and the
-- computer hadn't added yet was deleted when the screen went: Help, the Calendar,
-- Settings, F5, another collection. Deleting the collection a session named did the same
-- to every waiting scan of that computer.
--
-- Now a scan hangs off the computer itself (devices), so ending or deleting a session
-- leaves it, and it remembers the list it was sent to (target_kind, target_buy_id). Only
-- that list claims it: the one the claim names, or, from an app that names none, the one
-- the computer's session has open now. So a card scanned for one collection never lands
-- in another; it comes in when the phone pairs with its list again. Unclaimed scans are
-- still swept after a week (scan_send). Dev had no scans (checked 2026-10-19).

alter table public.scans
  add column target_kind   text check (target_kind in ('walk_in', 'collection')),
  add column target_buy_id uuid,   -- no key: the collection may go; its scans then wait for nothing
  drop constraint scans_session_device_id_fkey,
  add constraint scans_session_device_id_fkey
    foreign key (session_device_id) references public.devices (id) on delete cascade;

comment on column public.scans.target_kind is 'The list it was sent to (decision 343): walk_in, or collection with target_buy_id.';

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
                     finish, condition, tier, client_id, target_kind, target_buy_id)
  values (p_device, p_phone, btrim(p_scan ->> 'scryfall_id'), coalesce(p_scan ->> 'name', ''),
          coalesce(p_scan ->> 'set_code', ''), coalesce(p_scan ->> 'collector_number', ''),
          p_scan ->> 'finish', p_scan ->> 'condition', coalesce(p_scan ->> 'tier', '1')::smallint, v_client,
          v.target_kind, v.buy_id)
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

-- Claimed only by its own list (decision 343): the one named, or with none named (the app
-- before this change) the one this computer's session has open. A scan from before 0080
-- (no list) goes to whichever list claims it, as before. New arguments with defaults, so
-- a two-argument call still works; dropped first, as another signature would be a second
-- function beside the old one.
drop function public.scan_claim(uuid, uuid);
create function public.scan_claim(p_id uuid, p_device uuid, p_kind text default null, p_buy_id uuid default null)
 returns jsonb
 language plpgsql
 set search_path to 'public', 'internal'
as $function$
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
     and (c.status in ('sent', 'undo')
          or (c.status in ('pricing', 'undoing') and c.handled_at < now() - interval '1 minute'))
  returning to_jsonb(c.*) into v;
  return v;
end;
$function$;
revoke all on function public.scan_claim(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.scan_claim(uuid, uuid, text, uuid) to authenticated, service_role;
