CREATE OR REPLACE FUNCTION public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_last4 text := nullif(upper(btrim(coalesce(p_id_last4, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  b       buys;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  -- No phone is allowed (the app's Ctrl+click Create, owner 2026-10-09);
  -- one given must still be 10 digits.
  if v_phone is not null and v_phone !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
    raise exception 'bad_last4';
  end if;

  insert into buys (kind, status, customer_name, phone, id_last4, notes, created_by, last_edited_by)
  values ('collection', 'processing', v_name, v_phone, v_last4, v_notes, p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name))
    || case when v_phone is not null
            then jsonb_build_array(jsonb_build_object('field', 'phone', 'before', null, 'after', format_phone(v_phone)))
            else '[]'::jsonb end
    || case when v_last4 is not null
            then jsonb_build_array(jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', v_last4))
            else '[]'::jsonb end
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Collection created for %s', v_name)));
  perform internal.request_end(p_request, b.id::text);
  return b.id;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
