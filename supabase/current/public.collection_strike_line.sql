CREATE OR REPLACE FUNCTION public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
  v_id  uuid;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.system_key is not null then
    raise exception 'system_collection';
  end if;
  if b.project then
    raise exception 'project_no_strike';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status <> 'paid' then
    raise exception 'strike_paid_only';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform collection_event(b, p_user, p_device, 'collection_cards_struck', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the list, crossed out, and never exported'));
  return v_id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
