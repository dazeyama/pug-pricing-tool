-- Customers (owner, 2026-10-09): every customer name used on a confirmed
-- walk-in buy or a customer collection, kept with the phone number most
-- recently recorded with it, so CONFIRM BUY and + Price Collection can suggest
-- past customers as a name is typed and fill in the phone. No ID numbers are
-- kept here, ever (the Last 4 ID stays on its collection only).
--
-- One row per name (case and spacing ignored). A trigger on buys keeps it up to
-- date from every path that sets a name: CONFIRM BUY, collection_create, a
-- collection's name or phone edited, a backup restored. A newer record's
-- spelling and phone win; a record with no phone never clears one, and a
-- collection renamed without touching its phone doesn't re-record it. Projects
-- and Can't upload cards aren't customers. Deleting a buy or collection
-- doesn't forget the customer; restoring a backup rebuilds the list from it.
-- The browser only reads it.

create table public.customers (
  name_key  text primary key,
  name      text not null,
  phone     text,
  last_used timestamptz not null default now()
);
create index customers_last_used on public.customers (last_used desc);

alter table public.customers enable row level security;
revoke all on public.customers from anon;
grant select on public.customers to authenticated;
create policy "store: read" on public.customers for select to authenticated using (true);

-- A name as kept: trimmed, single spaces. Its key: that, lower case.
create or replace function internal.customer_name(p_name text) returns text
language sql immutable
set search_path = public, internal
as $$
  select regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g')
$$;

create or replace function internal.customer_key(p_name text) returns text
language sql immutable
set search_path = public, internal
as $$
  select lower(internal.customer_name(p_name))
$$;

-- buys trigger: a confirmed walk-in buy, or a customer collection, remembers
-- its customer. A live change counts as now; a row inserted with its own
-- history (a restore) counts as when it happened, so the latest still wins.
-- It never stops the buy itself: anything going wrong here is skipped.
create or replace function internal.remember_customer() returns trigger
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v_name text := internal.customer_name(new.customer_name);
  v_phone text := case when new.phone ~ '^[0-9]{10}$' then new.phone end;
  v_at timestamptz;
begin
  if v_name = '' then return new; end if;
  if new.kind = 'walk_in' and new.status is distinct from 'confirmed' then return new; end if;
  if new.kind = 'collection' and (new.project or new.system_key is not null) then return new; end if;
  if new.kind not in ('walk_in', 'collection') then return new; end if;
  -- An update only counts when it records the customer: a walk-in being
  -- confirmed, or a name or phone changed (not a collection's status alone).
  if tg_op = 'UPDATE'
     and new.customer_name is not distinct from old.customer_name
     and new.phone is not distinct from old.phone
     and not (new.kind = 'walk_in' and old.status is distinct from 'confirmed') then
    return new;
  end if;
  v_at := case when tg_op = 'UPDATE' then now()
               else coalesce(new.confirmed_at, new.updated_at, new.created_at, now()) end;
  -- A collection renamed with its phone untouched records the name only.
  if tg_op = 'UPDATE' and new.kind = 'collection' and new.phone is not distinct from old.phone then
    v_phone := null;
  end if;
  begin
    insert into customers as c (name_key, name, phone, last_used)
    values (lower(v_name), v_name, v_phone, v_at)
    on conflict (name_key) do update set
      name      = case when excluded.last_used >= c.last_used then excluded.name else c.name end,
      phone     = case when excluded.phone is not null and (c.phone is null or excluded.last_used >= c.last_used)
                       then excluded.phone else c.phone end,
      last_used = greatest(c.last_used, excluded.last_used);
  exception when others then
    raise warning 'remember_customer skipped: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function internal.remember_customer() from public, anon, authenticated;

create trigger buys_remember_customer
  after insert or update of customer_name, phone, status on public.buys
  for each row execute function internal.remember_customer();

-- Everyone already on file: each name's latest spelling, its latest phone
-- number, and when it was last used.
insert into public.customers (name_key, name, phone, last_used)
select key,
       (array_agg(name order by at desc))[1],
       (array_agg(phone order by at desc) filter (where phone is not null))[1],
       max(at)
  from (
    select internal.customer_key(customer_name) as key,
           internal.customer_name(customer_name) as name,
           case when phone ~ '^[0-9]{10}$' then phone end as phone,
           coalesce(confirmed_at, updated_at, created_at) as at
      from public.buys
     where internal.customer_name(customer_name) <> ''
       and ((kind = 'walk_in' and status = 'confirmed')
            or (kind = 'collection' and not project and system_key is null))
  ) x
 group by key
on conflict (name_key) do nothing;

-- restore_backup (migration 0015), with the customers cleared too: the
-- restored buys and collections put theirs back through the trigger.
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

  lock table buys, buy_lines, events, staff_users, settings, collection_locks, customers in exclusive mode;

  -- Out with the old: locks, buys and collections (their lines go with them),
  -- the customers, the changelog, and every setting but when the last backup was taken.
  delete from collection_locks;
  delete from buys;
  delete from customers;
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
