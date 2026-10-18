CREATE OR REPLACE FUNCTION public.collection_unexport(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_cards    integer;
  v_returned integer;
  v_skus     text;
begin
  if p_user is null then raise exception 'no_user'; end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  -- Can't upload cards' own export moves its copies out; there's nothing here to undo.
  if b.system_key is not null then raise exception 'system_collection'; end if;
  select array_agg(id), sum(quantity), string_agg(distinct cc_custom_sku, ', ')
    into v_lines, v_cards, v_skus
    from buy_lines where buy_id = b.id and cc_status is not null;
  if v_lines is null then raise exception 'nothing_to_undo'; end if;

  update buy_lines set
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, b.customer_name, p_user, p_device);

  perform collection_event(b, p_user, p_device, 'collection_unexported', array['mtg'], 0, 0, null, '[]', '[]',
    format('Export undone%s: %s card%s no longer marked exported%s.',
           case when v_skus is not null then ' (Custom SKU ' || v_skus || ')' else '' end,
           v_cards, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s taken back out of Can''t upload cards', v_returned)
                else '' end));
  return jsonb_build_object('cards', v_cards, 'returned', v_returned);
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
