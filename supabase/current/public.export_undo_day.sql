CREATE OR REPLACE FUNCTION public.export_undo_day(p_day date, p_game text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_user     staff_users;
  v_ids      uuid[];
  v_lines    uuid[];
  v_count    integer;
  v_returned integer;
  v_game     text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
  v_from     text;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  v_from := v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY');

  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
   for update;
  select array_agg(distinct b.id), array_agg(l.id) into v_ids, v_lines
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is not null
     -- Not the Magic cards Mark as completed struck: they went elsewhere (decision 340).
     and l.struck_at is distinct from l.completed_at;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where id = any(v_lines);
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);
  v_returned := cant_upload_return(v_lines, v_from, p_user, p_device);

  select * into v_user from staff_users where id = p_user;
  perform internal.insert_event(p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
    p_target_name => v_from, p_games => array[p_game], p_day => p_day,
    p_fields => jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
    p_summary => format('%s %s buy%s marked Paid/Ours again%s.', v_count, v_game,
                        case when v_count = 1 then '' else 's' end,
                        case when v_returned > 0
                             then format('; %s card%s taken back out of Can''t upload cards', v_returned,
                                         case when v_returned = 1 then '' else 's' end)
                             else '' end));
  return v_count;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
