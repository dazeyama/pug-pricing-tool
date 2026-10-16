CREATE OR REPLACE FUNCTION public.buy_restore_line(p_line_id uuid, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  v_old    buy_lines;
  v_target text;
  v_id     uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is null then
    raise exception 'line_not_struck';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  v_id := internal.restore_line(v_old.id);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform buy_event(b, p_user, p_device, 'buy_cards_restored', v_target, array[v_old.game], 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'restored', true, 'qty', v_old.quantity, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_old.quantity || ' ' || v_old.name))),
    sentence(internal.lines_count_text(array[v_old], 'struck') || ' restored'));
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
