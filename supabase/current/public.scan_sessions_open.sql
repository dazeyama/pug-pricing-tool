CREATE OR REPLACE FUNCTION public.scan_sessions_open()
 RETURNS TABLE(device_id uuid, device_label text, target_kind text, buy_id uuid, target_name text, games text[], staff_user_id uuid, staff_user_name text, locked text, can_add boolean, heartbeat_at timestamp with time zone, phone_device_id uuid, phone_label text, paired_at timestamp with time zone, phone_seen_at timestamp with time zone, scanned integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'internal'
AS $function$
  select s.device_id, d.label, s.target_kind, s.buy_id, s.target_name, s.games,
         s.staff_user_id, u.name, s.locked, s.can_add, s.heartbeat_at,
         s.phone_device_id, p.label, s.paired_at, s.phone_seen_at, s.scanned
    from scan_sessions s
    join devices d on d.id = s.device_id
    left join staff_users u on u.id = s.staff_user_id
    left join devices p on p.id = s.phone_device_id
   where s.heartbeat_at >= now() - interval '60 seconds'
   order by d.label, s.device_id
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
