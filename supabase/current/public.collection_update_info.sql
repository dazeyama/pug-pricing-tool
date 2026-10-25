CREATE OR REPLACE FUNCTION public.collection_update_info(p_buy_id uuid, p_fields jsonb, p_user uuid, p_device uuid, p_expected_version integer)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
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
  v_auto   boolean;
  v_skip   boolean;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  -- A project has no rates (owner, 2026-10-15): it's the store's own cards.
  -- Auto apply rates is true or false (decision 448).
  if p_fields ? 'auto_rates' and jsonb_typeof(p_fields -> 'auto_rates') is distinct from 'boolean' then
    raise exception 'bad_auto_rates';
  end if;
  if b.project and (p_fields ? 'custom_cash_pct' or p_fields ? 'custom_credit_pct'
                    or coalesce((p_fields ->> 'auto_rates')::boolean, false)) then
    raise exception 'project_rates';
  end if;
  -- Skip pricing is true or false, and a project's only (decision 513).
  if p_fields ? 'skip_pricing' and jsonb_typeof(p_fields -> 'skip_pricing') is distinct from 'boolean' then
    raise exception 'bad_skip_pricing';
  end if;
  if not b.project and coalesce((p_fields ->> 'skip_pricing')::boolean, false) then
    raise exception 'skip_pricing_project';
  end if;
  v_name := b.customer_name;
  v_phone := b.phone;
  v_notes := b.notes;
  v_last4 := b.id_last4;
  v_cash := b.custom_cash_pct;
  v_credit := b.custom_credit_pct;
  v_auto := b.auto_rates;
  v_skip := b.skip_pricing;

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

  -- Auto apply rates (decision 448): the lower rate for the copies we own, on every card added from now on.
  if p_fields ? 'auto_rates' then
    v_auto := coalesce((p_fields ->> 'auto_rates')::boolean, false);
    if v_auto is distinct from b.auto_rates then
      v_rows := v_rows || jsonb_build_object('field', 'auto apply rates',
        'before', case when b.auto_rates then 'on' else 'off' end, 'after', case when v_auto then 'on' else 'off' end);
      v_names := v_names || 'auto apply rates'::text;
    end if;
  end if;

  -- Skip pricing (decision 513): the cards added from now on go in with no price.
  if p_fields ? 'skip_pricing' then
    v_skip := coalesce((p_fields ->> 'skip_pricing')::boolean, false);
    if v_skip is distinct from b.skip_pricing then
      v_rows := v_rows || jsonb_build_object('field', 'skip pricing',
        'before', case when b.skip_pricing then 'on' else 'off' end, 'after', case when v_skip then 'on' else 'off' end);
      v_names := v_names || 'skip pricing'::text;
    end if;
  end if;

  if jsonb_array_length(v_rows) = 0 then
    return;
  end if;

  update buys
     set customer_name = v_name, phone = v_phone, id_last4 = v_last4, notes = v_notes,
         custom_cash_pct = v_cash, custom_credit_pct = v_credit, auto_rates = v_auto, skip_pricing = v_skip,
         version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = p_buy_id
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_info_edited', '{}', 0, 0, null, '[]', v_rows,
    sentence('Details edited: ' || array_to_string(v_names, ', ')));
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
