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
  insert into settings (key, value, updated_at, updated_by) values (p_key, p_value, v_at, p_user)
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return v_at;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
