-- Phase 10: the header's global search (spec 13) and backups (spec 11.5).

-- ---------------------------------------------------------------------------
-- norm_number: collector numbers compare without case or leading zeros,
-- "037" = "37", "TG05" = "tg5" (the client's normNumber, lib/query.js).
-- ---------------------------------------------------------------------------
create or replace function public.norm_number(p text) returns text
language sql immutable
set search_path = public
as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '^([a-zA-Z]*-?)0+(?=[0-9])', '\1'))
$$;

-- ---------------------------------------------------------------------------
-- search_set_codes: every set code a stored line uses, lower case. The header
-- search reads a trailing word as a set code only when it's one of these,
-- as the main search does with the games' set lists (spec 8.2).
-- ---------------------------------------------------------------------------
create or replace function public.search_set_codes() returns text[]
language sql stable
set search_path = public
as $$
  select coalesce(array_agg(distinct lower(set_code)), '{}') from buy_lines
$$;

-- ---------------------------------------------------------------------------
-- global_search: lines in confirmed walk-in buys and in collections that
-- aren't Completed (owner, 2026-09-29: their cards have moved on), matching
--   p_name   part of the name (folded like name_key), or of a Japanese card's
--            English name; empty matches any name
--   p_number the collector number, without case or leading zeros
--   p_size   the printed set size (plain counts only)
--   p_set    the set code
-- Newest first, at most 200 lines. A walk-in line carries its buy's number
-- for that day and game ("Buy 2"), counted as confirm_buy and the day pages
-- count them.
-- ---------------------------------------------------------------------------
create or replace function public.global_search(
  p_name   text,
  p_number text,
  p_size   integer,
  p_set    text
) returns table (
  line_id          uuid,
  buy_id           uuid,
  kind             text,
  status           text,
  customer_name    text,
  paid_method      text,
  confirmed_at     timestamptz,
  confirmed_by     uuid,
  buy_number       integer,
  game             text,
  lang             text,
  name             text,
  name_en          text,
  set_code         text,
  collector_number text,
  finish           text,
  first_edition    boolean,
  treatments       jsonb,
  quantity         integer,
  image_url        text
)
language sql stable
set search_path = public
as $$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_name, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           btrim(coalesce(p_name, '')) = '' as any_name
  ),
  hits as (
    select l.id as line_id, l.buy_id, b.kind, b.status, b.customer_name, b.paid_method,
           b.confirmed_at, b.confirmed_by, l.game, l.lang, l.name, l.name_en, l.set_code,
           l.collector_number, l.finish, l.first_edition, l.treatments, l.quantity, l.image_url,
           coalesce(b.confirmed_at, b.created_at) as newest, l.position
      from buy_lines l
      join buys b on b.id = l.buy_id
      cross join q
     where ((b.kind = 'walk_in' and b.status = 'confirmed')
         or (b.kind = 'collection' and b.status in ('processing', 'priced', 'paid')))
       and (q.any_name or l.name_key like q.pat or lower(coalesce(l.name_en, '')) like q.pat)
       and (p_number is null or norm_number(l.collector_number) = norm_number(p_number))
       and (p_size is null or l.printed_size = p_size)
       and (p_set is null or lower(l.set_code) = lower(btrim(p_set)))
     order by newest desc, l.buy_id, l.position
     limit 200
  )
  select h.line_id, h.buy_id, h.kind, h.status, h.customer_name, h.paid_method,
         h.confirmed_at, h.confirmed_by,
         case when h.kind = 'walk_in' then (
           select count(*)::integer from buys x
            where x.kind = 'walk_in' and x.status = 'confirmed'
              and (x.confirmed_at at time zone 'America/Los_Angeles')::date
                = (h.confirmed_at at time zone 'America/Los_Angeles')::date
              and (x.confirmed_at, x.id) <= (h.confirmed_at, h.buy_id)
              and exists (select 1 from buy_lines y where y.buy_id = x.id and y.game = h.game))
         end,
         h.game, h.lang, h.name, h.name_en, h.set_code, h.collector_number, h.finish,
         h.first_edition, h.treatments, h.quantity, h.image_url
    from hits h
   order by h.newest desc, h.buy_id, h.position
$$;

-- ---------------------------------------------------------------------------
-- Backups (spec 11.5). A backup holds the store's own records: staff users,
-- computers, buys and collections with their lines, the changelog, and
-- settings. Left out, as the spec says: secrets, collection locks and the
-- two price caches; and, as built, api_usage (JustTCG's live counters) and
-- master_inventory_files (the CSVs themselves aren't in a backup, so their
-- list stays with them in storage).
-- ---------------------------------------------------------------------------
create or replace function public.backup_export() returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'format', 'pug-pricing-backup',
    'version', 1,
    'exported_at', now(),
    'tables', jsonb_build_object(
      'staff_users', coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from staff_users t), '[]'),
      'devices',     coalesce((select jsonb_agg(to_jsonb(t) order by t.id) from devices t), '[]'),
      'buys',        coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at, t.id) from buys t), '[]'),
      'buy_lines',   coalesce((select jsonb_agg(to_jsonb(t) order by t.buy_id, t.position, t.id) from buy_lines t), '[]'),
      'events',      coalesce((select jsonb_agg(to_jsonb(t) - 'search_text' - 'search_digits' order by t.seq) from events t), '[]'),
      'settings',    coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from settings t), '[]')))
$$;

-- What's here now, counted as the restore dialog counts a backup file.
create or replace function public.backup_counts() returns jsonb
language sql stable
set search_path = public
as $$
  select jsonb_build_object(
    'buys',        (select count(*) from buys where kind = 'walk_in' and status = 'confirmed'),
    'collections', (select count(*) from buys where kind = 'collection'),
    'lines',       (select count(*) from buy_lines),
    'events',      (select count(*) from events),
    'users',       (select count(*) from staff_users where active))
$$;

-- Inserts a backup's rows into one table: every column but generated ones,
-- so a column added later still round-trips. Only restore_backup calls it.
create or replace function public.restore_rows(p_table text, p_rows jsonb, p_conflict text default '')
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_cols text;
  v_count integer;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER';
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                 p_table, v_cols, v_cols, p_table, p_conflict)
    using coalesce(p_rows, '[]'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- restore_backup: everything the backup holds replaces what's here, in one
-- transaction, then a "Backup restored — <file>" milestone is logged.
-- Security definer: the changelog is append-only for the store's role, and a
-- restore has to replace it. Kept as they are: this computer and every other
-- one (their names stay, and the backup's are added), staff users not in the
-- backup (hidden, like a deleted user, so what they did keeps its name), the
-- Crystal Commerce CSVs, the API keys, and when the last backup was taken.
-- ---------------------------------------------------------------------------
create or replace function public.restore_backup(
  p_payload jsonb,
  p_file    text,
  p_user    uuid,
  p_device  uuid,
  p_typed   text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  t jsonb := p_payload -> 'tables';
  v_user staff_users;
  v_counts jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_typed is distinct from 'RESTORE' then raise exception 'not_confirmed'; end if;
  if p_payload ->> 'format' is distinct from 'pug-pricing-backup'
     or (p_payload ->> 'version') is distinct from '1'
     or jsonb_typeof(t) is distinct from 'object'
     or jsonb_typeof(t -> 'staff_users') is distinct from 'array'
     or jsonb_typeof(t -> 'devices') is distinct from 'array'
     or jsonb_typeof(t -> 'buys') is distinct from 'array'
     or jsonb_typeof(t -> 'buy_lines') is distinct from 'array'
     or jsonb_typeof(t -> 'events') is distinct from 'array'
     or jsonb_typeof(t -> 'settings') is distinct from 'array' then
    raise exception 'bad_backup';
  end if;

  lock table buys, buy_lines, events, staff_users, settings, collection_locks in exclusive mode;

  -- Out with the old: locks, buys and collections (their lines go with them),
  -- the changelog, and every setting but when the last backup was taken.
  delete from collection_locks;
  delete from buys;
  delete from events;
  update settings set updated_by = null where key = 'last_backup_at';
  delete from settings where key <> 'last_backup_at';

  -- Staff users: all hidden, then the backup's put back as they were.
  update staff_users set active = false where active;
  perform restore_rows('staff_users', t -> 'staff_users',
    'on conflict (id) do update set name = excluded.name, color = excluded.color, '
    || 'active = excluded.active, created_at = excluded.created_at');
  -- Computers: the backup's are added; the ones here keep their names.
  perform restore_rows('devices', t -> 'devices', 'on conflict (id) do nothing');

  perform restore_rows('buys', t -> 'buys');
  perform restore_rows('buy_lines', t -> 'buy_lines');
  perform restore_rows('events', t -> 'events');
  perform setval(pg_get_serial_sequence('public.events', 'seq'),
                 greatest(coalesce((select max(seq) from events), 0), 1));
  perform restore_rows('settings',
    (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(t -> 'settings') r
      where r ->> 'key' <> 'last_backup_at'));

  -- The milestone (spec 12): always shown on the line.
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'app', 'backup_restored',
          p_file, 'Backup restored — ' || coalesce(nullif(btrim(p_file), ''), 'backup file'));

  select backup_counts() into v_counts;
  return v_counts;
end;
$$;

revoke execute on function
  public.norm_number(text),
  public.search_set_codes(),
  public.global_search(text, text, integer, text),
  public.backup_export(),
  public.backup_counts(),
  public.restore_rows(text, jsonb, text),
  public.restore_backup(jsonb, text, uuid, uuid, text)
from public, anon;
grant execute on function
  public.norm_number(text),
  public.search_set_codes(),
  public.global_search(text, text, integer, text),
  public.backup_export(),
  public.backup_counts(),
  public.restore_backup(jsonb, text, uuid, uuid, text)
to authenticated;
-- restore_rows runs only inside restore_backup (as its owner), never on its own.
revoke execute on function public.restore_rows(text, jsonb, text) from authenticated;
