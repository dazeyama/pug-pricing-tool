-- 0082: a backup restores into a new project too (DESIGN_SPEC decision 348).
--
-- Disaster recovery didn't work end to end (the full launch review's A7):
--  - restore_backup reset only the Changelog's numbering, so in a new project the buy
--    numbers started at 1 and every CONFIRM BUY collided with a restored buy. Now the
--    sequence carries on past the highest restored number.
--  - restore_rows filled a column the backup lacks with NULL, so a backup from before a
--    NOT NULL column (0031's project, 0053's condition check) failed. Now only the
--    backup's own columns are written; the rest take their defaults.
--  - backups held 6 of the tables: the matches staff taught (cc_product_links, cc_set_map,
--    import_links) were lost. Now they're in the backup and restored when the file has
--    them (the owner, 2026-10-19: in backups; prod still starts without them).
-- Same signatures, so the grants stay.

CREATE OR REPLACE FUNCTION public.restore_rows(p_table text, p_rows jsonb, p_conflict text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_cols text;
  v_count integer;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into v_cols
    from information_schema.columns
   where table_schema = 'public' and table_name = p_table and is_generated = 'NEVER'
     -- Only the backup's own columns: one added since takes its default (decision 348).
     and exists (select 1 from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where r ? column_name);
  if v_cols is null then
    return 0;   -- no rows
  end if;
  execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) %s',
                 p_table, v_cols, v_cols, p_table, p_conflict)
    using coalesce(p_rows, '[]'::jsonb);
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.backup_export()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
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
      'settings',    coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from settings t), '[]'),
      -- The matches staff taught (decision 348).
      'cc_set_map',       coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_set, t.promo_kind) from cc_set_map t), '[]'),
      'cc_product_links', coalesce((select jsonb_agg(to_jsonb(t) order by t.scryfall_id, t.finish) from cc_product_links t), '[]'),
      'import_links',     coalesce((select jsonb_agg(to_jsonb(t) order by t.key) from import_links t), '[]')))
$function$;

CREATE OR REPLACE FUNCTION public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  lock table buys, buy_lines, events, staff_users, settings, collection_locks, customers,
             cc_set_map, cc_product_links, import_links in exclusive mode;

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
  -- Buy numbers carry on past the restored ones (decision 348): in a new project they'd start
  -- at 1 and collide. Numbers used after the backup was made can't be known: see SETUP.md.
  if exists (select 1 from buys where number is not null) then
    perform setval('public.buys_number_seq',
                   greatest((select max(number) from buys),
                            (select case when is_called then last_value else last_value - 1 end from public.buys_number_seq)),
                   true);
  end if;
  -- The learned matches, when the file has them (decision 348; older backups don't).
  if jsonb_typeof(t -> 'cc_set_map') = 'array' then
    delete from cc_set_map;
    perform restore_rows('cc_set_map', t -> 'cc_set_map');
  end if;
  if jsonb_typeof(t -> 'cc_product_links') = 'array' then
    delete from cc_product_links;
    perform restore_rows('cc_product_links', t -> 'cc_product_links');
  end if;
  if jsonb_typeof(t -> 'import_links') = 'array' then
    delete from import_links;
    perform restore_rows('import_links', t -> 'import_links');
  end if;
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
$function$;
