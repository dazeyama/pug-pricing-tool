-- The customer's "Last 4 ID" on a collection (owner, 2026-09-29): up to 4
-- letters or digits, capitals, optional. Entered in + Price Collection and
-- edited in the collection's details; not shown on the table. Logged like
-- the other details ("last 4 ID").

alter table public.buys
  add column id_last4 text check (id_last4 is null or id_last4 ~ '^[A-Z0-9]{1,4}$');

-- collection_create gains p_id_last4; the old signature goes so there's one.
drop function public.collection_create(text, text, text, uuid, uuid);

create function public.collection_create(
  p_name   text,
  p_phone  text,
  p_notes  text,
  p_user   uuid,
  p_device uuid,
  p_id_last4 text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_last4 text := nullif(upper(btrim(coalesce(p_id_last4, ''))), '');
  b       buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  if coalesce(p_phone, '') !~ '^[0-9]{10}$' then
    raise exception 'bad_phone';
  end if;
  if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
    raise exception 'bad_last4';
  end if;

  insert into buys (kind, status, customer_name, phone, id_last4, notes, created_by, last_edited_by)
  values ('collection', 'processing', v_name, p_phone, v_last4, v_notes, p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(
      jsonb_build_object('field', 'name', 'before', null, 'after', v_name),
      jsonb_build_object('field', 'phone', 'before', null, 'after', format_phone(p_phone)))
    || case when v_last4 is not null
            then jsonb_build_array(jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', v_last4))
            else '[]'::jsonb end
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Collection created for %s', v_name)));
  return b.id;
end;
$$;

-- collection_update_info also takes 'id_last4' (blank clears it).
create or replace function public.collection_update_info(
  p_buy_id           uuid,
  p_fields           jsonb,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_name   text;
  v_phone  text;
  v_notes  text;
  v_last4  text;
  v_cash   numeric;
  v_credit numeric;
  v_rows   jsonb := '[]'::jsonb;
  v_names  text[] := '{}';
  v_master numeric;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_last4 := b.id_last4;
  v_cash := b.custom_cash_pct;
  v_credit := b.custom_credit_pct;

  if p_fields ? 'name' then
    v_name := btrim(regexp_replace(coalesce(p_fields ->> 'name', ''), '\s+', ' ', 'g'));
    if char_length(v_name) not between 1 and 80 then
      raise exception 'bad_name';
    end if;
    if v_name is distinct from b.customer_name then
      v_rows := v_rows || jsonb_build_object('field', 'name', 'before', b.customer_name, 'after', v_name);
      v_names := v_names || 'name'::text;
    end if;
  end if;

  if p_fields ? 'phone' then
    v_phone := coalesce(p_fields ->> 'phone', '');
    if v_phone !~ '^[0-9]{10}$' then
      raise exception 'bad_phone';
    end if;
    if v_phone is distinct from b.phone then
      v_rows := v_rows || jsonb_build_object('field', 'phone',
        'before', format_phone(b.phone), 'after', format_phone(v_phone));
      v_names := v_names || 'phone'::text;
    end if;
  end if;

  if p_fields ? 'id_last4' then
    v_last4 := nullif(upper(btrim(coalesce(p_fields ->> 'id_last4', ''))), '');
    if v_last4 is not null and v_last4 !~ '^[A-Z0-9]{1,4}$' then
      raise exception 'bad_last4';
    end if;
    if v_last4 is distinct from b.id_last4 then
      v_rows := v_rows || jsonb_build_object('field', 'last 4 ID', 'before', b.id_last4, 'after', v_last4);
      v_names := v_names || 'last 4 ID'::text;
    end if;
  end if;

  if p_fields ? 'notes' then
    v_notes := btrim(coalesce(p_fields ->> 'notes', ''));
    if v_notes is distinct from b.notes then
      v_rows := v_rows || jsonb_build_object('field', 'notes', 'before', b.notes, 'after', v_notes);
      v_names := v_names || 'notes'::text;
    end if;
  end if;

  -- Rates read "cash %: 33 → 40", and cleared "cash %: 40 → master (33)" (spec 12.3).
  if p_fields ? 'custom_cash_pct' then
    v_cash := (p_fields ->> 'custom_cash_pct')::numeric;
    if v_cash is not null and (v_cash < 0 or v_cash > 100) then
      raise exception 'bad_pct';
    end if;
    if v_cash is distinct from b.custom_cash_pct then
      v_master := master_pct('cash_pct');
      v_rows := v_rows || jsonb_build_object('field', 'cash %',
        'before', pct_text(coalesce(b.custom_cash_pct, v_master)),
        'after', case when v_cash is null then 'master (' || pct_text(v_master) || ')' else pct_text(v_cash) end);
      v_names := v_names || 'cash %'::text;
    end if;
  end if;

  if p_fields ? 'custom_credit_pct' then
    v_credit := (p_fields ->> 'custom_credit_pct')::numeric;
    if v_credit is not null and (v_credit < 0 or v_credit > 100) then
      raise exception 'bad_pct';
    end if;
    if v_credit is distinct from b.custom_credit_pct then
      v_master := master_pct('credit_pct');
      v_rows := v_rows || jsonb_build_object('field', 'credit %',
        'before', pct_text(coalesce(b.custom_credit_pct, v_master)),
        'after', case when v_credit is null then 'master (' || pct_text(v_master) || ')' else pct_text(v_credit) end);
      v_names := v_names || 'credit %'::text;
    end if;
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return;
  end if;

  update buys
     set customer_name = v_name, phone = v_phone, id_last4 = v_last4, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$$;

revoke execute on function public.collection_create(text, text, text, uuid, uuid, text) from public, anon;
grant execute on function public.collection_create(text, text, text, uuid, uuid, text) to authenticated;
