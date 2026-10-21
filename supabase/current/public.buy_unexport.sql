CREATE OR REPLACE FUNCTION public.buy_unexport(p_buy_id uuid, p_game text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b          buys;
  v_lines    uuid[];
  v_count    integer;
  v_cards    integer;
  v_market   numeric;
  v_returned integer;
  v_target   text;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null then raise exception 'bad_game'; end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then raise exception 'buy_gone'; end if;
  if p_expected_version is not null and b.version <> p_expected_version then raise exception 'stale_version'; end if;

  select array_agg(id), count(*) into v_lines, v_count
    from buy_lines where buy_id = b.id and game = p_game and completed_at is not null
     -- Not the Magic cards Mark as completed struck: they went elsewhere (decision 340).
     and struck_at is distinct from completed_at;
  if v_lines is null then return 0; end if;
  v_target := buy_target_name(b.id);

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = b.id returning * into b;
  v_returned := cant_upload_return(v_lines, v_target, p_user, p_device);
  -- Pulled cards' copies come back out too (decision 406).
  v_returned := v_returned + internal.pulled_return(v_lines, v_target, p_user, p_device);

  select coalesce(sum(quantity), 0), coalesce(sum(unit_price * quantity), 0) into v_cards, v_market
    from buy_lines where id = any(v_lines);
  perform buy_event(b, p_user, p_device, 'buy_unexported', v_target, array[p_game], 0,
    internal.lines_totals(b, array(select l from buy_lines l where l.id = any(v_lines))), '[]'::jsonb,
    format('%s %s card%s marked Paid/Ours again%s.', v_cards, v_game, case when v_cards = 1 then '' else 's' end,
           case when v_returned > 0
                then format('; %s card%s taken back out of Can''t upload cards or Bulk pulled from exports', v_returned,
                            case when v_returned = 1 then '' else 's' end)
                else '' end));
  return v_count;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
