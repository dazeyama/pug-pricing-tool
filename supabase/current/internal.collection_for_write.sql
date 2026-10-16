CREATE OR REPLACE FUNCTION internal.collection_for_write(p_buy_id uuid, p_device uuid, p_expected_version integer, p_content boolean)
 RETURNS buys
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  v_lock collection_locks;
begin
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  -- Can't upload cards: no adding, editing or detail changes (spec 9.1).
  if p_content and b.system_key is not null then
    raise exception 'system_collection';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is null or v_lock.device_id is distinct from p_device then
    raise exception 'not_lock_holder';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  -- A project is Paid/Ours from the start and stays editable until it's
  -- exported (owner, 2026-10-01).
  if p_content and b.status = 'paid' and not b.project then
    raise exception 'collection_paid';
  end if;
  if p_content and b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  -- Rejected: locked like Completed (owner, 2026-10-09).
  if p_content and b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
