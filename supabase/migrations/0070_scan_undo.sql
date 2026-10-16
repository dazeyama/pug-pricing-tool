-- Scanning from a phone, Phase S5 (docs/SCAN_FUNCTION.md 9.3): Undo last
-- scan. The phone asks (scan_undo: an added scan becomes `undo`); the
-- computer takes it on like a scan to price (scan_claim: `undoing`), removes
-- one copy from its list as × would, and says how it went (scan_resolve:
-- `undone`, the session's count one lower; or back to `added` with a note).
--
-- Lines changed:
--   scans' status check gains 'undo', 'undoing', 'undone';
--   scan_claim: also takes `undo` (→ `undoing`), and an `undoing` gone quiet for a minute;
--   scan_resolve: an `undoing` scan resolves to `undone` or `added`;
--   scan_undo: new.

alter table public.scans drop constraint scans_status_check;
alter table public.scans add constraint scans_status_check
  check (status in ('sent', 'pricing', 'added', 'needs_price', 'failed', 'skipped', 'undo', 'undoing', 'undone'));

CREATE OR REPLACE FUNCTION public.scan_claim(p_id uuid, p_device uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v jsonb;
begin
  update scans
     set status = case when status in ('undo', 'undoing') then 'undoing' else 'pricing' end, handled_at = now()
   where id = p_id and session_device_id = p_device
     and (status in ('sent', 'undo')
          or (status in ('pricing', 'undoing') and handled_at < now() - interval '1 minute'))
  returning to_jsonb(scans.*) into v;
  return v;
end;
$function$;

CREATE OR REPLACE FUNCTION public.scan_resolve(p_id uuid, p_device uuid, p_status text, p_line_id uuid, p_price numeric, p_source text, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  -- An undo the computer took on: done (one copy fewer, the phone's count too), or not (back to added, saying why).
  if v.status = 'undoing' then
    if coalesce(p_status, '') not in ('undone', 'added') then
      raise exception 'bad_status';
    end if;
    update scans
       set status = p_status,
           line_qty = (select quantity from buy_lines where id = v.line_id),
           note = p_note,
           handled_at = now()
     where id = p_id;
    if p_status = 'undone' then
      update scan_sessions set scanned = greatest(scanned - 1, 0) where device_id = p_device;
    end if;
    return;
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
$function$;

-- The phone's Undo: an added scan of its own goes back off the list.
create or replace function public.scan_undo(p_id uuid, p_phone uuid)
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
  if v.status <> 'added' then
    raise exception 'not_added';
  end if;
  update scans set status = 'undo', note = null, handled_at = now() where id = p_id;
end;
$$;

revoke execute on function public.scan_undo(uuid, uuid) from public, anon;
grant execute on function public.scan_undo(uuid, uuid) to authenticated, service_role;
