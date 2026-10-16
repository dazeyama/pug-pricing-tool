CREATE OR REPLACE FUNCTION public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
  v_qty integer;
begin
  select l.buy_id, l.quantity into v_buy, v_qty
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    return;   -- already gone (another tab removed it)
  end if;
  if p_qty >= v_qty then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - greatest(p_qty, 1) where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
