-- Projects (owner, 2026-10-01): a collection of cards the store already owns
-- (a box found in the back, nothing to do with any buy) priced so it can be
-- exported. Made with just a name and notes; no phone, no Last 4 ID, no
-- offer and no price paid. It starts Paid/Ours, stays editable while it is,
-- and EXPORT makes it Completed like any collection; Reopen brings it back.
-- It never goes to Processing or Priced. Everything else is a collection's.

alter table public.buys add column project boolean not null default false;
alter table public.buys drop constraint buys_collection_needs_name_phone;
alter table public.buys add constraint buys_collection_needs_name_phone check (
  kind <> 'collection' or (customer_name is not null and (phone is not null or system_key is not null or project)));
alter table public.buys add constraint buys_project_is_collection check (
  not project or (kind = 'collection' and system_key is null));

-- ---------------------------------------------------------------------------
-- project_create: + Start Project. A name (1–80 characters) and notes.
-- ---------------------------------------------------------------------------
create or replace function public.project_create(
  p_name   text,
  p_notes  text,
  p_user   uuid,
  p_device uuid
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
  b       buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;

  insert into buys (kind, status, project, customer_name, phone, notes, paid_at, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, null, v_notes, now(), p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name))
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Project started: %s', v_name)));
  return b.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_for_write (0028): a Paid/Ours project can still be edited.
-- ---------------------------------------------------------------------------
create or replace function public.collection_for_write(
  p_buy_id           uuid,
  p_device           uuid,
  p_expected_version integer,
  p_content          boolean
) returns buys
language plpgsql
set search_path = public
as $$
declare
  b      buys;
  v_lock collection_locks;
begin
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  -- Can't upload cards: no adding, editing or detail changes (spec 9.1).
  if p_content and b.system_key is not null then
    raise exception 'system_collection';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is null or v_lock.device_id is distinct from p_device then
    raise exception 'not_lock_holder';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  -- A project is Paid/Ours from the start and stays editable until it's
  -- exported (owner, 2026-10-01).
  if p_content and b.status = 'paid' and not b.project then
    raise exception 'collection_paid';
  end if;
  if p_content and b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_set_status (0030): a project never goes to Processing or Priced.
-- ---------------------------------------------------------------------------
create or replace function public.collection_set_status(
  p_buy_id           uuid,
  p_status           text,
  p_user             uuid,
  p_device           uuid,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer,
  p_offer_cash       numeric default null,
  p_offer_credit     numeric default null,
  p_paid_price       numeric default null,
  p_paid_method      text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_was    text;
  v_cash   numeric;
  v_credit numeric;
  v_market numeric;
  v_rows   jsonb;
  v_totals jsonb := null;
  v_summary text;
  v_undo    uuid[];
  v_back    integer := 0;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  -- Can't upload cards is always Paid/Ours (spec 9.1).
  if exists (select 1 from buys where id = p_buy_id and system_key is not null) then
    raise exception 'system_collection';
  end if;
  if p_status not in ('processing', 'priced', 'paid', 'completed') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- A project is only ever Paid/Ours, or Completed by EXPORT (owner, 2026-10-01).
  if b.project and p_status in ('processing', 'priced') then
    raise exception 'project_status';
  end if;
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;
  -- Leaving Completed undoes its export (export spec 9.4): the stamps go, so
  -- the buy prices show again, and its cards come back out of Can't upload
  -- cards.
  if v_was = 'completed' then
    select array_agg(id) into v_undo from buy_lines where buy_id = p_buy_id and cc_status is not null;
    if v_undo is not null then
      update buy_lines set
        cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
        cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
        cc_exported_at = null
      where id = any(v_undo);
      v_back := cant_upload_return(v_undo, b.customer_name, p_user, p_device);
    end if;
  end if;
  v_cash := coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct'));
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct'));
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = p_buy_id;
  v_rows := jsonb_build_array(jsonb_build_object('field', 'status',
    'before', status_label(v_was), 'after', status_label(p_status)));

  if p_status = 'priced' and v_was = 'processing' then
    if p_offer_cash is null or p_offer_cash < 0 then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = 'priced', offer_cash = p_offer_cash,
           offer_credit = coalesce(p_offer_credit,
             case when v_cash > 0 then round_down_price(p_offer_cash * v_credit / v_cash) end),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'offer', 'before', null,
      'after', concat_ws(' / ', money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));
    v_totals := collection_totals(b, v_market);
    v_summary := sentence('Marked Priced: offered ' || concat_ws(' / ',
      money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));

  elsif p_status = 'paid' and v_was = 'completed' then
    -- Reopened: back to Paid/Ours, still locked, with what was paid.
    update buys
       set status = 'paid', completed_at = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Reopened: back to Paid/Ours, still locked.';

  elsif p_status = 'paid' then
    if p_paid_price is null or p_paid_price < 0 then
      raise exception 'paid_price_needed';
    end if;
    if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
      raise exception 'paid_method_needed';
    end if;
    update buys
       set status = 'paid', paid_at = now(), completed_at = null,
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
    v_totals := collection_totals(b, v_market);
    v_summary := format('Marked Paid/Ours: paid %s in %s, locked.', money_text(p_paid_price), p_paid_method);

  elsif p_status = 'completed' then
    -- Only EXPORT marks a collection Completed (owner, 2026-10-01; export_lines).
    raise exception 'complete_by_export';

  else
    -- Back to Priced or Processing: not paid after all. From Processing to
    -- Priced without an offer can't happen (handled above).
    update buys
       set status = p_status, paid_at = null, completed_at = null,
           cash_pct = null, credit_pct = null, paid_price = null, paid_method = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := case when v_was in ('paid', 'completed')
                      then sentence('Unlocked: back to ' || status_label(p_status))
                      else sentence('Marked ' || status_label(p_status)) end;
  end if;

  if v_undo is not null then
    v_summary := v_summary || ' Its export was undone' || case when v_back > 0
      then format(': %s card%s taken back out of Can''t upload cards.', v_back, case when v_back = 1 then '' else 's' end)
      else '.' end;
  end if;
  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, v_totals, '[]',
    v_rows, v_summary);
end;
$$;

revoke execute on function public.project_create(text, text, uuid, uuid) from public, anon;
grant execute on function public.project_create(text, text, uuid, uuid) to authenticated;
