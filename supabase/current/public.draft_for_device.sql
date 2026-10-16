CREATE OR REPLACE FUNCTION public.draft_for_device(p_device uuid, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy uuid;
begin
  select id into v_buy from buys
   where draft_device_id = p_device and status = 'draft'
   for update;
  if v_buy is null then
    insert into buys (kind, status, draft_device_id, created_by, last_edited_by)
    values ('walk_in', 'draft', p_device, p_user, p_user)
    on conflict (draft_device_id) where status = 'draft' do nothing
    returning id into v_buy;
    if v_buy is null then
      select id into v_buy from buys
       where draft_device_id = p_device and status = 'draft'
       for update;
    end if;
  end if;
  return v_buy;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
