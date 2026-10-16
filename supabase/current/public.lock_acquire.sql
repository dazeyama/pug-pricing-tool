CREATE OR REPLACE FUNCTION public.lock_acquire(p_buy_id uuid, p_device uuid, p_user uuid, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v jsonb;
begin
  if not exists (select 1 from buys where id = p_buy_id and kind = 'collection') then
    raise exception 'collection_gone';
  end if;

  insert into collection_locks as l (buy_id, device_id, staff_user_id, acquired_at, heartbeat_at)
  values (p_buy_id, p_device, p_user, now(), now())
  on conflict (buy_id) do update
     set device_id = excluded.device_id,
         staff_user_id = excluded.staff_user_id,
         acquired_at = case when l.device_id = excluded.device_id then l.acquired_at else now() end,
         heartbeat_at = now()
   where p_force
      or l.device_id = excluded.device_id
      or l.heartbeat_at < now() - interval '60 seconds';

  select jsonb_build_object(
           'held', l.device_id = p_device,
           'device_id', l.device_id,
           'device_label', d.label,
           'staff_user_id', l.staff_user_id,
           'acquired_at', l.acquired_at)
    into v
    from collection_locks l left join devices d on d.id = l.device_id
   where l.buy_id = p_buy_id;
  return v;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
