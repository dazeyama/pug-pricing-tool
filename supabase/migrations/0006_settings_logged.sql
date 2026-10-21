-- Settings changes need a picked user and go in the Changelog (decision 412): the owner, "Settings
-- don't require user picked or fire events for the Actions changelog, but they should", every store
-- change. The Changelog is written only by the database (decision 378), so:
--   settings_save refuses no user ('no_user') and writes a 'setting_changed' entry: the setting's
--     name and the app's sentence of what changed, before → after (p_summary, new and defaulted);
--   master_inventory_start refuses no user; master_inventory_finish writes 'inventory_uploaded';
--   public.settings_log writes the three the app does outside the database's own functions: a
--     JustTCG key saved or deleted (never the key) and a remembered match forgotten.
-- The app as pushed keeps working, except that a Settings box saved with no user picked is now refused,
-- which is the point. settings_save is dropped and recreated with two defaulted parameters.

-- One Settings entry (kind 'app', under Actions). Owner's rights not needed: insert_event has them.
create function internal.settings_event(p_user uuid, p_device uuid, p_action text, p_target text, p_fields jsonb, p_summary text)
returns void
language plpgsql
set search_path = public, internal, pg_temp
as $$
declare
  v_user staff_users;
begin
  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'app', p_action,
    p_target_name => p_target, p_fields => coalesce(p_fields, '[]'::jsonb), p_summary => coalesce(p_summary, ''));
end;
$$;
revoke all on function internal.settings_event(uuid, uuid, text, text, jsonb, text) from public, anon;
grant execute on function internal.settings_event(uuid, uuid, text, text, jsonb, text) to authenticated, service_role;

drop function public.settings_save(text, jsonb, uuid, timestamp with time zone);
CREATE FUNCTION public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone, p_device uuid DEFAULT NULL::uuid, p_summary text DEFAULT NULL::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v settings;
  v_at timestamptz := clock_timestamp();   -- not the transaction's start: two saves in one never look alike
begin
  -- A user, always (decision 412).
  if p_user is null then raise exception 'no_user'; end if;
  select * into v from settings where key = p_key for update;
  if (v.key is null and p_expected is not null) or (v.key is not null and v.updated_at is distinct from p_expected) then
    raise exception 'settings_changed';
  end if;
  if v.key is null then
    -- A new key's first save: two at once both found no row. The second one's insert waits for
    -- the first's, then is refused like any out-of-date save (decision 394).
    insert into settings (key, value, updated_at, updated_by) values (p_key, p_value, v_at, p_user)
    on conflict (key) do nothing;
    if not found then
      raise exception 'settings_changed';
    end if;
  else
    update settings set value = p_value, updated_at = v_at, updated_by = p_user where key = p_key;
  end if;
  -- The Changelog (decision 412): the setting's name, and the app's sentence of what changed,
  -- before → after (the entries stay as written, so in words, not keys).
  perform internal.settings_event(p_user, p_device, 'setting_changed',
    case p_key
      when 'cash_pct' then 'Master Buy Percentages' when 'credit_pct' then 'Master Buy Percentages'
      when 'fallback_pct_mtg' then 'Master Fallback Percentages' when 'fallback_pct_pokemon' then 'Master Fallback Percentages'
      when 'rate_tiers' then 'Low-end and high-end rates' when 'bulk_values' then 'Bulk values'
      else p_key end,
    '[]'::jsonb, left(coalesce(p_summary, format('%s saved.', p_key)), 300));
  return v_at;
end;
$function$;
revoke all on function public.settings_save(text, jsonb, uuid, timestamp with time zone, uuid, text) from public, anon;
grant execute on function public.settings_save(text, jsonb, uuid, timestamp with time zone, uuid, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.master_inventory_start(p_storage_path text, p_original_filename text, p_size_bytes integer, p_row_count integer, p_columns text[], p_uploaded_by uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_id uuid;
begin
  -- A user, always (decision 412): the upload is in the Changelog under their name.
  if p_uploaded_by is null then raise exception 'no_user'; end if;
  insert into master_inventory_files
    (storage_path, original_filename, size_bytes, row_count, columns, uploaded_by, is_current)
  values
    (p_storage_path, p_original_filename, p_size_bytes, p_row_count, p_columns, p_uploaded_by, false)
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.master_inventory_finish(p_file_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
declare
  pruned text[];
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  perform pg_advisory_xact_lock(hashtext('master_inventory_files'));
  if not exists (select 1 from master_inventory_files where id = p_file_id) then
    raise exception 'upload_gone';
  end if;
  update master_inventory_files set is_current = false where is_current;
  update master_inventory_files
     set is_current = true,
         products_loaded = (select count(*) from cc_products where file_id = p_file_id)
   where id = p_file_id;
  with gone as (
    delete from master_inventory_files where id <> p_file_id returning storage_path
  )
  select coalesce(array_agg(storage_path), '{}') into pruned from gone;
  -- The Changelog (decision 412), under the user who started the upload.
  perform internal.settings_event(f.uploaded_by, null, 'inventory_uploaded', 'Master Crystal Inventory', '[]'::jsonb,
    format('Master Crystal Inventory uploaded: %s, %s products.', f.original_filename, f.products_loaded))
    from master_inventory_files f where f.id = p_file_id;
  return pruned;
end;
$function$;

-- What the app does outside the database's own functions, logged by it (decision 412).
create function public.settings_log(p_user uuid, p_device uuid, p_action text, p_summary text)
returns void
language plpgsql
set search_path = public, internal
as $$
begin
  if p_user is null or not exists (select 1 from staff_users where id = p_user) then raise exception 'no_user'; end if;
  if p_action is null or p_action not in ('justtcg_key_saved', 'justtcg_key_removed', 'cc_match_forgotten') then
    raise exception 'bad_action';
  end if;
  perform internal.settings_event(p_user, p_device, p_action,
    case when p_action = 'cc_match_forgotten' then 'Crystal Commerce matching' else 'API keys' end,
    '[]'::jsonb, left(coalesce(p_summary, ''), 300));
end;
$$;
revoke all on function public.settings_log(uuid, uuid, text, text) from public, anon;
grant execute on function public.settings_log(uuid, uuid, text, text) to authenticated, service_role;
