CREATE OR REPLACE FUNCTION internal.remember_customer()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'internal', 'pg_temp'
AS $function$
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
$function$;

-- Granted: {postgres=X/postgres}
