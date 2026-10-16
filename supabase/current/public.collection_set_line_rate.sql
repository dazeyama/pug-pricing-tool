CREATE OR REPLACE FUNCTION public.collection_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid, p_device uuid, p_expected_version integer, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b      buys;
  v_old  buy_lines;
  v_new  buy_lines;
  v_rows jsonb := '[]'::jsonb;
  v_side text;
  v_was  numeric;
  v_now  numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);
  -- A project has no rates (owner, 2026-10-15): it's the store's own cards.
  if b.project then
    raise exception 'project_rates';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.custom_cash_pct is not distinct from p_cash and v_old.custom_credit_pct is not distinct from p_credit then
    return;
  end if;

  update buy_lines
     set custom_cash_pct = p_cash, custom_credit_pct = p_credit, cash_pct = null, credit_pct = null
   where id = p_line_id
  returning * into v_new;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id
  returning * into b;

  foreach v_side in array array['credit', 'cash'] loop
    v_was := internal.line_pct(v_old, b, v_side);
    v_now := internal.line_pct(v_new, b, v_side);
    if v_was is distinct from v_now then
      v_rows := v_rows || jsonb_build_object('field', v_side || ' %', 'before', pct_text(v_was),
        'after', pct_text(v_now) || case when (case v_side when 'cash' then p_cash else p_credit end) is null
                                         then ' (own rate cleared)' else '' end);
    end if;
  end loop;

  perform collection_event(b, p_user, p_device, 'collection_line_rate', array[v_old.game], 0, 0, null, '[]',
    v_rows,
    sentence(case when p_cash is null and p_credit is null
                  then format('Own rate cleared: %s', coalesce(p_text, v_old.name))
                  else format('Own rate set: %s', coalesce(p_text, v_old.name)) end));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
