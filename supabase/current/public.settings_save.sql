CREATE OR REPLACE FUNCTION public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v settings;
  v_at timestamptz := clock_timestamp();   -- not the transaction's start: two saves in one never look alike
begin
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
  return v_at;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
