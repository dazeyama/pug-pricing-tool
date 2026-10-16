-- Scanning from a phone, Phase S1 (docs/SCAN_FUNCTION.md 9.1, 9.3): a
-- computer's price screen, open for a phone to pair with.
--
-- One row per computer while its Price tab or a collection's screen is open,
-- kept fresh by a heartbeat every 20 seconds (fresh = a beat in the last 60);
-- and the one phone paired with it, if any (one phone per computer, and one
-- computer per phone). Transient: not in backups, swept after a day without
-- a beat, gone with its computer, and with its collection.
--
-- `can_add` is worked out from the rest: a user picked, nothing locking the
-- list (`locked`: the screen's reason, "Paid/Ours: unlock it to edit"), and
-- Magic on (the screen's MTG toggle). Every function is the store's own
-- (security invoker), like the app's others.

create table public.scan_sessions (
  device_id        uuid primary key references public.devices (id) on delete cascade,
  target_kind      text not null check (target_kind in ('walk_in', 'collection')),
  buy_id           uuid references public.buys (id) on delete cascade,
  target_name      text not null default '',
  games            text[] not null default '{}',
  staff_user_id    uuid references public.staff_users (id) on delete set null,
  locked           text,
  can_add          boolean generated always as
                     (staff_user_id is not null and locked is null and 'mtg' = any (games)) stored,
  heartbeat_at     timestamptz not null default now(),
  phone_device_id  uuid references public.devices (id) on delete set null,
  paired_at        timestamptz,
  phone_seen_at    timestamptz,
  scanned          integer not null default 0 check (scanned >= 0),
  constraint scan_sessions_target check ((target_kind = 'collection') = (buy_id is not null)),
  constraint scan_sessions_not_itself check (phone_device_id is distinct from device_id)
);

-- One computer per phone.
create unique index scan_sessions_phone on public.scan_sessions (phone_device_id)
  where phone_device_id is not null;

alter table public.scan_sessions enable row level security;
revoke all on public.scan_sessions from anon;
grant select, insert, update, delete on public.scan_sessions to authenticated;
create policy "store: full access" on public.scan_sessions for all to authenticated using (true) with check (true);

-- Phones see computers come and go, and computers see phones pair.
alter publication supabase_realtime add table public.scan_sessions;

-- The fresh sessions, as the phone's landing page lists them: the computer's
-- name, what its screen is on, its picked user, and the phone paired with it.
create or replace function public.scan_sessions_open()
returns table (
  device_id uuid, device_label text, target_kind text, buy_id uuid, target_name text, games text[],
  staff_user_id uuid, staff_user_name text, locked text, can_add boolean, heartbeat_at timestamptz,
  phone_device_id uuid, phone_label text, paired_at timestamptz, phone_seen_at timestamptz, scanned integer
)
language sql stable
set search_path = public, internal
as $$
  select s.device_id, d.label, s.target_kind, s.buy_id, s.target_name, s.games,
         s.staff_user_id, u.name, s.locked, s.can_add, s.heartbeat_at,
         s.phone_device_id, p.label, s.paired_at, s.phone_seen_at, s.scanned
    from scan_sessions s
    join devices d on d.id = s.device_id
    left join staff_users u on u.id = s.staff_user_id
    left join devices p on p.id = s.phone_device_id
   where s.heartbeat_at >= now() - interval '60 seconds'
   order by d.label, s.device_id
$$;

-- A computer's price screen says it's open and what it's on: every 20
-- seconds, and whenever that changes. A session that had gone stale (no beat
-- for 60 seconds: a closed laptop) loses its phone, which was told the
-- computer stopped. Returns the session as scan_sessions_open lists it.
create or replace function public.scan_session_touch(
  p_device uuid, p_kind text, p_buy_id uuid, p_name text, p_games text[], p_user uuid, p_locked text)
returns jsonb
language plpgsql
set search_path = public, internal
as $$
begin
  if not exists (select 1 from devices where id = p_device) then
    raise exception 'no_device';
  end if;
  delete from scan_sessions where heartbeat_at < now() - interval '1 day';

  insert into scan_sessions as s (device_id, target_kind, buy_id, target_name, games, staff_user_id, locked, heartbeat_at)
  values (p_device, p_kind, p_buy_id, coalesce(p_name, ''), coalesce(p_games, '{}'), p_user,
          nullif(btrim(p_locked), ''), now())
  on conflict (device_id) do update
     set target_kind = excluded.target_kind,
         buy_id = excluded.buy_id,
         target_name = excluded.target_name,
         games = excluded.games,
         staff_user_id = excluded.staff_user_id,
         locked = excluded.locked,
         heartbeat_at = now(),
         phone_device_id = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_device_id end,
         paired_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.paired_at end,
         phone_seen_at = case when s.heartbeat_at < now() - interval '60 seconds' then null else s.phone_seen_at end;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$$;

-- The computer left its price screen (or closed the tab): the session goes.
create or replace function public.scan_session_end(p_device uuid)
returns void
language sql
set search_path = public, internal
as $$
  delete from scan_sessions where device_id = p_device
$$;

-- A phone pairs with a computer's session. It replaces any phone already
-- paired there, and leaves any other computer it was paired with. The count
-- of cards scanned starts again for a new phone; the same phone pairing again
-- (Continue scanning) keeps it.
create or replace function public.scan_pair(p_device uuid, p_phone uuid)
returns jsonb
language plpgsql
set search_path = public, internal
as $$
declare
  v scan_sessions;
begin
  if p_phone is null or p_phone = p_device or not exists (select 1 from devices where id = p_phone) then
    raise exception 'not_a_device';
  end if;
  select * into v from scan_sessions where device_id = p_device for update;
  if not found then
    raise exception 'session_gone';
  end if;
  if v.heartbeat_at < now() - interval '60 seconds' then
    raise exception 'session_stale';
  end if;
  if v.locked is not null or not ('mtg' = any (v.games)) then
    raise exception 'cannot_scan';
  end if;

  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where phone_device_id = p_phone and device_id <> p_device;
  update scan_sessions
     set phone_device_id = p_phone,
         paired_at = case when phone_device_id = p_phone then paired_at else now() end,
         scanned = case when phone_device_id = p_phone then scanned else 0 end,
         phone_seen_at = now()
   where device_id = p_device;

  return (select to_jsonb(o) from scan_sessions_open() o where o.device_id = p_device);
end;
$$;

-- The phone's heartbeat while it's on the scanning screen. False when it's
-- no longer paired there (replaced, unpaired, or the computer gone or stale).
create or replace function public.scan_phone_beat(p_device uuid, p_phone uuid)
returns boolean
language plpgsql
set search_path = public, internal
as $$
begin
  update scan_sessions set phone_seen_at = now()
   where device_id = p_device and phone_device_id = p_phone
     and heartbeat_at >= now() - interval '60 seconds';
  return found;
end;
$$;

-- Unpair: the phone's own Unpair (p_phone, only if it's the one paired), or
-- the computer's (p_phone null, whichever phone it is).
create or replace function public.scan_unpair(p_device uuid, p_phone uuid)
returns void
language plpgsql
set search_path = public, internal
as $$
begin
  if not exists (select 1 from scan_sessions where device_id = p_device) then
    raise exception 'session_gone';
  end if;
  update scan_sessions set phone_device_id = null, paired_at = null, phone_seen_at = null
   where device_id = p_device and (p_phone is null or phone_device_id = p_phone);
end;
$$;

revoke execute on function public.scan_sessions_open() from public, anon;
revoke execute on function public.scan_session_touch(uuid, text, uuid, text, text[], uuid, text) from public, anon;
revoke execute on function public.scan_session_end(uuid) from public, anon;
revoke execute on function public.scan_pair(uuid, uuid) from public, anon;
revoke execute on function public.scan_phone_beat(uuid, uuid) from public, anon;
revoke execute on function public.scan_unpair(uuid, uuid) from public, anon;
grant execute on function public.scan_sessions_open() to authenticated, service_role;
grant execute on function public.scan_session_touch(uuid, text, uuid, text, text[], uuid, text) to authenticated, service_role;
grant execute on function public.scan_session_end(uuid) to authenticated, service_role;
grant execute on function public.scan_pair(uuid, uuid) to authenticated, service_role;
grant execute on function public.scan_phone_beat(uuid, uuid) to authenticated, service_role;
grant execute on function public.scan_unpair(uuid, uuid) to authenticated, service_role;
