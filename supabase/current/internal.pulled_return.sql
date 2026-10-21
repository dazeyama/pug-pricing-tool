CREATE OR REPLACE FUNCTION internal.pulled_return(p_originals uuid[], p_from text, p_user uuid, p_device uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_sys   uuid;
  b       buys;
  v_cards integer;
  v_lines jsonb;
begin
  select id into v_sys from buys where system_key = 'pulled';
  if v_sys is null or coalesce(array_length(p_originals, 1), 0) = 0 then return 0; end if;
  select * into b from buys where id = v_sys for update;
  select sum(l.quantity),
         jsonb_agg(jsonb_build_object('sign', '-', 'qty', l.quantity, 'game', l.game, 'unit_price', l.unit_price,
                                      'text', export_line_text(l)) order by l.position)
    into v_cards, v_lines
    from buy_lines l where l.buy_id = v_sys and l.source_line_id = any(p_originals);
  if coalesce(v_cards, 0) = 0 then return 0; end if;
  delete from buy_lines where buy_id = v_sys and source_line_id = any(p_originals);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user
   where id = v_sys returning * into b;
  perform collection_event(b, p_user, p_device, 'pulled_returned', array['mtg'], 0, v_cards, null, v_lines, '[]',
    format('%s card%s taken back out: the export of %s was undone.', v_cards,
           case when v_cards = 1 then '' else 's' end, p_from));
  return v_cards;
end;
$function$;

-- Granted: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
