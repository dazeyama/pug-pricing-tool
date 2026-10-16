CREATE OR REPLACE FUNCTION internal.restore_line(p_line_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_old  buy_lines;
  v_twin uuid;
begin
  select * into v_old from buy_lines where id = p_line_id for update;
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is null then
    raise exception 'line_not_struck';
  end if;
  select l.id into v_twin from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> v_old.id and l.struck_at is null and l.completed_at is null
     and internal.same_line(l, v_old)
   order by l.position
   limit 1;
  if v_twin is null then
    update buy_lines set struck_at = null, struck_by = null where id = v_old.id;
    return v_old.id;
  end if;
  update buy_lines set quantity = quantity + v_old.quantity where id = v_twin;
  delete from buy_lines where id = v_old.id;
  return v_twin;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
