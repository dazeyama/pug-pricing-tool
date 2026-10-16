CREATE OR REPLACE FUNCTION public.draft_set_line_rate(p_line_id uuid, p_cash numeric, p_credit numeric, p_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  perform internal.check_rate(p_cash);
  perform internal.check_rate(p_credit);
  select l.buy_id into v_buy
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;
  update buy_lines set custom_cash_pct = p_cash, custom_credit_pct = p_credit where id = p_line_id;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
