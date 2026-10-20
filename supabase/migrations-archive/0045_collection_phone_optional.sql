-- Creating a collection (owner, 2026-10-09): the Last 4 ID is now required
-- and the phone still is, both checked in the app, but Ctrl+click on Create
-- lets either be left out (an admin shortcut; the name is always needed).
-- So the database allows a collection with no phone: the table's check
-- needs only the name, and collection_create takes a missing phone (one
-- given must still be 10 digits). A phone can be added later as before.

alter table public.buys drop constraint buys_collection_needs_name_phone;
alter table public.buys add constraint buys_collection_needs_name check (
  kind <> 'collection' or customer_name is not null);

create or replace function public.collection_create(
  p_name   text,
  p_phone  text,
  p_notes  text,
  p_user   uuid,
  p_device uuid,
  p_id_last4 text default null
) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  v_last4 text := nullif(upper(btrim(coalesce(p_id_last4, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  b       buys;
begin
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
  return b.id;
end;
$$;
