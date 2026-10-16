-- Scanning from a phone, Phase S2 (docs/SCAN_FUNCTION.md 9.2, 9.3): each
-- card a phone sends to the computer it's paired with, and what became of it.
--
-- The phone recognises the card and sends its printing, finish and
-- condition (scan_send). The computer claims it (scan_claim: `pricing`),
-- prices it and adds it to its list as ADD CARD would, then says how that
-- went (scan_resolve: `added`, `needs_price` or `failed`). A card with no
-- price anywhere waits for the phone's answer (scan_answer): a price sends
-- it back to the computer, nothing skips it. A claim that's gone quiet for a
-- minute (the computer's tab closed mid-way) can be claimed again.
--
-- Transient like scan_sessions: a session's scans go with it, and anything
-- a week old is swept. Not in backups.

create table public.scans (
  id                uuid primary key default gen_random_uuid(),
  session_device_id uuid not null references public.scan_sessions (device_id) on delete cascade,
  phone_device_id   uuid not null references public.devices (id) on delete cascade,
  scryfall_id       text not null check (btrim(scryfall_id) <> ''),
  name              text not null default '',
  set_code          text not null default '',
  collector_number  text not null default '',
  finish            text not null check (finish in ('nonfoil', 'foil', 'etched')),
  condition         text not null check (condition in ('NM', 'LP', 'MP', 'HP', 'DMG')),
  tier              smallint not null default 1 check (tier between 1 and 3),
  manual_price      numeric(10,2) check (manual_price is null or manual_price > 0),
  status            text not null default 'sent'
                      check (status in ('sent', 'pricing', 'added', 'needs_price', 'failed', 'skipped')),
  line_id           uuid,                        -- the list line it became (or joined); no key: lines come and go
  line_qty          integer,                     -- that line's quantity just after
  price             numeric(10,2),
  price_source      text,
  note              text,                        -- why it failed, in the computer's words
  created_at        timestamptz not null default now(),
  handled_at        timestamptz                  -- its status last changed
);

create index scans_session on public.scans (session_device_id, created_at);
create index scans_phone on public.scans (phone_device_id, created_at);

alter table public.scans enable row level security;
revoke all on public.scans from anon;
grant select, insert, update, delete on public.scans to authenticated;
create policy "store: full access" on public.scans for all to authenticated using (true) with check (true);

-- The computer hears a scan arrive; the phone hears what became of it.
alter publication supabase_realtime add table public.scans;

-- The phone sends a card. Only the paired phone, to a fresh session that can
-- take cards (a user picked, its list open to new cards, Magic on).
create or replace function public.scan_send(p_device uuid, p_phone uuid, p_scan jsonb)
returns uuid
language plpgsql
set search_path = public, internal
as $$
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
$$;

-- The computer takes a waiting scan to price it. Null when it isn't
-- waiting (another tab of this computer took it, or it's been answered).
create or replace function public.scan_claim(p_id uuid, p_device uuid)
returns jsonb
language plpgsql
set search_path = public, internal
as $$
declare
  v jsonb;
begin
  update scans set status = 'pricing', handled_at = now()
   where id = p_id and session_device_id = p_device
     and (status = 'sent' or (status = 'pricing' and handled_at < now() - interval '1 minute'))
  returning to_jsonb(scans.*) into v;
  return v;
end;
$$;

-- The computer says how a claimed scan went: added (to `p_line_id`, at
-- `p_price` from `p_source`), needs a price, or failed (`p_note` says why).
create or replace function public.scan_resolve(
  p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text)
returns void
language plpgsql
set search_path = public, internal
as $$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.session_device_id <> p_device then
    raise exception 'not_session';
  end if;
  if coalesce(p_status, '') not in ('added', 'needs_price', 'failed') or v.status <> 'pricing' then
    raise exception 'bad_status';
  end if;

  update scans
     set status = p_status,
         line_id = p_line_id,
         line_qty = (select quantity from buy_lines where id = p_line_id),
         price = p_price,
         price_source = p_source,
         note = p_note,
         handled_at = now()
   where id = p_id;
  if p_status = 'added' then
    update scan_sessions set scanned = scanned + 1 where device_id = p_device;
  end if;
end;
$$;

-- The phone answers a scan that needs a price: a price sends it back to the
-- computer (added as a manual price), null skips it.
create or replace function public.scan_answer(p_id uuid, p_phone uuid, p_price numeric)
returns void
language plpgsql
set search_path = public, internal
as $$
declare
  v scans;
begin
  select * into v from scans where id = p_id for update;
  if not found then
    raise exception 'scan_gone';
  end if;
  if v.phone_device_id <> p_phone then
    raise exception 'not_phone';
  end if;
  if v.status <> 'needs_price' then
    raise exception 'not_waiting';
  end if;
  if p_price is null then
    update scans set status = 'skipped', handled_at = now() where id = p_id;
    return;
  end if;
  if p_price < 0.01 or p_price > 99999999.99 or p_price <> round(p_price, 2) then
    raise exception 'bad_price';
  end if;
  update scans set status = 'sent', manual_price = p_price, handled_at = now() where id = p_id;
end;
$$;

revoke execute on function public.scan_send(uuid, uuid, jsonb) from public, anon;
revoke execute on function public.scan_claim(uuid, uuid) from public, anon;
revoke execute on function public.scan_resolve(uuid, uuid, text, uuid, numeric, text, text) from public, anon;
revoke execute on function public.scan_answer(uuid, uuid, numeric) from public, anon;
grant execute on function public.scan_send(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.scan_claim(uuid, uuid) to authenticated, service_role;
grant execute on function public.scan_resolve(uuid, uuid, text, uuid, numeric, text, text) to authenticated, service_role;
grant execute on function public.scan_answer(uuid, uuid, numeric) to authenticated, service_role;
