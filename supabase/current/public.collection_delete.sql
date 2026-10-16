CREATE OR REPLACE FUNCTION public.collection_delete(p_buy_id uuid, p_user uuid, p_device uuid, p_typed_name text, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_lock   collection_locks;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards can't be deleted (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(b.customer_name)) then
    raise exception 'name_mismatch';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is not null and v_lock.device_id is distinct from p_device
     and v_lock.heartbeat_at > now() - interval '60 seconds' then
    raise exception 'locked_elsewhere';
  end if;

  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) as q, sum(unit_price * quantity) as m
            from buy_lines where buy_id = p_buy_id group by game) t;

  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = p_buy_id;

  perform collection_event(b, p_user, p_device, 'collection_deleted', coalesce(v_games, '{}'),
    0, (internal.line_counts(array(select l from buy_lines l where l.buy_id = b.id))).cards, internal.lines_totals(b, array(select l from buy_lines l where l.buy_id = b.id)), coalesce(v_lines, '[]'::jsonb),
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', null),
      jsonb_build_object('field', 'phone', 'before', format_phone(b.phone), 'after', null)),
    sentence('Collection deleted with ' || internal.lines_count_text(array(select l from buy_lines l where l.buy_id = b.id))));

  delete from buys where id = p_buy_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
