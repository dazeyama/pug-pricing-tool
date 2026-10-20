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
  -- The learned matches, when the file has them (decision 348; older backups don't). An empty list
  -- leaves what's here: a hand-edited file shouldn't empty what staff taught (decision 398).
  if jsonb_typeof(t -> 'cc_set_map') = 'array' and jsonb_array_length(t -> 'cc_set_map') > 0 then
    delete from cc_set_map;
    perform restore_rows('cc_set_map', t -> 'cc_set_map');
  end if;
  if jsonb_typeof(t -> 'cc_product_links') = 'array' and jsonb_array_length(t -> 'cc_product_links') > 0 then
    delete from cc_product_links;
    perform restore_rows('cc_product_links', t -> 'cc_product_links');
  end if;
  if jsonb_typeof(t -> 'import_links') = 'array' and jsonb_array_length(t -> 'import_links') > 0 then
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

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
