-- Removing cards from a Paid/Ours collection (owner, 2026-09-29): its cards
-- can still be taken off (not added or edited: it stays locked otherwise),
-- so the list matches what was really bought. A Completed collection can't
-- lose cards either: its cards have moved on.

create or replace function public.collection_remove_line(
  p_line_id          uuid,
  p_qty              integer,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_text             text
) returns void
language plpgsql
set search_path = public
as $$
declare
  b     buys;
  v_old buy_lines;
  v_n   integer;
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
  -- Paid/Ours may still lose cards (owner, 2026-09-29); Completed may not.
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, v_n,
    collection_totals(b, v_old.unit_price * v_n),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    '[]', sentence(format('%s card%s removed', v_n, case when v_n = 1 then '' else 's' end)));
end;
$$;
