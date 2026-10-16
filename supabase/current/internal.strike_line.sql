CREATE OR REPLACE FUNCTION internal.strike_line(p_line_id uuid, p_n integer, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_old  buy_lines;
  v_new  buy_lines;
  v_twin uuid;
begin
  select * into v_old from buy_lines where id = p_line_id for update;
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  p_n := least(greatest(coalesce(p_n, 1), 1), v_old.quantity);

  select l.id into v_twin from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> v_old.id and l.struck_at is not null and l.completed_at is null
     and internal.same_line(l, v_old)
   order by l.position
   limit 1;

  if v_twin is not null then
    update buy_lines set quantity = quantity + p_n where id = v_twin;
  elsif p_n >= v_old.quantity then
    update buy_lines set struck_at = now(), struck_by = p_user where id = v_old.id;
    return v_old.id;
  else
    update buy_lines set position = position + 1 where buy_id = v_old.buy_id and position > v_old.position;
    v_new := v_old;
    v_new.id := gen_random_uuid();
    v_new.position := v_old.position + 1;
    v_new.quantity := p_n;
    v_new.struck_at := now();
    v_new.struck_by := p_user;
    insert into buy_lines select (v_new).*;
    v_twin := v_new.id;
  end if;

  if p_n >= v_old.quantity then
    delete from buy_lines where id = v_old.id;
  else
    update buy_lines set quantity = quantity - p_n where id = v_old.id;
  end if;
  return v_twin;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
