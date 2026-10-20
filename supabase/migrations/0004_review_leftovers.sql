-- The launch reviews' leftovers (2026-10-20), one migration with one review: the owner's
-- "fix every last one of these opens now as a batch". The app as pushed (v1.0.0-launch) keeps
-- working: every new parameter has a default, nothing is renamed, and the one dropped signature
-- of each function below is recreated with the same parameters plus p_request.
--
--   decision 388  a write pressed again after its answer was lost happens once: an optional
--                 p_request id on draft_add_line, draft_remove_line, collection_add_line,
--                 collection_remove_line, collection_strike_line, buy_strike_line,
--                 buy_remove_line, collection_create and project_create; a request id already
--                 done returns what it returned then and changes nothing
--                 (internal.done_requests, internal.request_begin, internal.request_end);
--   decision 391  an edit keeps the scans its line came from, and lines folded together keep
--                 both lines' (draft_update_line, collection_update_line; internal.scan_ids,
--                 internal.with_scans);
--   decision 392  the phone's Undo takes one copy off once: the receiver sends the scan's id as
--                 draft_remove_line's / collection_remove_line's p_request (no SQL of its own);
--   decision 393  Convert to project / collection leaves a Completed side whole: its bulk,
--                 placeholders and struck cards stay on the buy (buy_to_project, buy_to_collection);
--   decision 394  two first saves of a new Settings key: the second is refused (settings_save);
--   decision 397  a project or collection made from a buy that kept the payment remembers that
--                 buy (buys.kept_buy_id), so Mark Paid/Ours again can say the payment is there;
--   decision 398  a restore leaves a learned-match table as it is when the file's list for it is
--                 empty (restore_backup), and public.backup_columns lets the dialog list the
--                 file's columns the database lacks.

-- ------------------------------------------------------- 388: a write done once per request id
-- A press again after a lost answer sends the same id (the app keeps it only then): the write
-- it repeats was done, or wasn't, and either way it happens once. Ids are kept a day; a repeat
-- comes within moments.
create table internal.done_requests (
  id      uuid primary key,
  result  text,
  done_at timestamptz not null default now()
);
create index done_requests_done_at on internal.done_requests (done_at);
revoke all on table internal.done_requests from public, anon, authenticated;

-- Null when this request hasn't been done; else {"result": what it returned, as text}. Two
-- presses with one id run one at a time: the second waits for the first's commit, then sees it.
create function internal.request_begin(p_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
declare
  v internal.done_requests;
begin
  if p_request is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtext('pug.request'), hashtext(p_request::text));
  select * into v from internal.done_requests where id = p_request;
  return case when v.id is null then null else jsonb_build_object('result', v.result) end;
end;
$$;
revoke all on function internal.request_begin(uuid) from public, anon;
grant execute on function internal.request_begin(uuid) to authenticated, service_role;

-- Recorded in the write's own transaction: a write that fails records nothing.
create function internal.request_end(p_request uuid, p_result text)
returns void
language plpgsql
security definer
set search_path = public, internal, pg_temp
as $$
begin
  if p_request is null then
    return;
  end if;
  insert into internal.done_requests (id, result) values (p_request, p_result) on conflict (id) do nothing;
  delete from internal.done_requests where done_at < now() - interval '1 day';
end;
$$;
revoke all on function internal.request_end(uuid, text) from public, anon;
grant execute on function internal.request_end(uuid, text) to authenticated, service_role;

-- The writes a press can repeat: ADD CARD, ×, strike, and creating a collection or a project.
drop function public.draft_add_line(uuid, jsonb, uuid, boolean, uuid);
CREATE FUNCTION public.draft_add_line(p_device uuid, p_line jsonb, p_user uuid, p_merge boolean DEFAULT true, p_draft_id uuid DEFAULT NULL::uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  v_buy  uuid;
  v_line uuid;
  r      buy_lines;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;
  -- A scan's card goes into the buy it was scanned for, or nowhere (decision 350).
  if p_draft_id is not null then
    -- Locked, and looked at again after a CONFIRM BUY in flight commits: a confirmed buy gets nothing more.
    select id into v_buy from buys where id = p_draft_id and status = 'draft' and draft_device_id = p_device for update;
    if v_buy is null then
      raise exception 'draft_gone';
    end if;
  else
    v_buy := draft_for_device(p_device, p_user);
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = v_buy
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
     limit 1;   -- the same card, own rate or not: the copies take the line's rate (owner, 2026-10-15)
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity,
           -- The scan it came from, on the line it joined (decision 351).
           price_snapshot = case when r.price_snapshot -> 'scan' ->> 'scan_id' is null then price_snapshot
             else jsonb_set(coalesce(price_snapshot, '{}'::jsonb), '{scans}',
                            coalesce(price_snapshot -> 'scans', '[]'::jsonb) || to_jsonb(r.price_snapshot -> 'scan' ->> 'scan_id')) end
     where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind)
    values (
      v_buy,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = v_buy),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

revoke all on function public.draft_add_line(uuid, jsonb, uuid, boolean, uuid, uuid) from public, anon;
grant execute on function public.draft_add_line(uuid, jsonb, uuid, boolean, uuid, uuid) to authenticated, service_role;

drop function public.draft_remove_line(uuid, integer, uuid);
CREATE FUNCTION public.draft_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  v_buy uuid;
  v_qty integer;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return;
  end if;
  select l.buy_id, l.quantity into v_buy, v_qty
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    return;   -- already gone (another tab removed it)
  end if;
  if p_qty >= v_qty then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - greatest(p_qty, 1) where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  perform internal.request_end(p_request, null);
end;
$function$;

revoke all on function public.draft_remove_line(uuid, integer, uuid, uuid) from public, anon;
grant execute on function public.draft_remove_line(uuid, integer, uuid, uuid) to authenticated, service_role;

drop function public.collection_add_line(uuid, jsonb, boolean, uuid, uuid, integer, text);
CREATE FUNCTION public.collection_add_line(p_buy_id uuid, p_line jsonb, p_merge boolean, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b      buys;
  r      buy_lines;
  v_line uuid;
  v_rec  buy_lines;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  if p_merge then
    select id into v_line from buy_lines l
     where l.buy_id = p_buy_id
       and internal.same_card(l, r)   -- the same printing at the same price (0065)
       and l.struck_at is null   -- never into a struck line
       and l.cc_status is null   -- nor an exported one (decision 345)
     limit 1;   -- the same card, own rate or not: the copies take the line's rate (owner, 2026-10-15)
  end if;

  if v_line is not null then
    update buy_lines set quantity = quantity + r.quantity,
           -- The scan it came from, on the line it joined (decision 351).
           price_snapshot = case when r.price_snapshot -> 'scan' ->> 'scan_id' is null then price_snapshot
             else jsonb_set(coalesce(price_snapshot, '{}'::jsonb), '{scans}',
                            coalesce(price_snapshot -> 'scans', '[]'::jsonb) || to_jsonb(r.price_snapshot -> 'scan' ->> 'scan_id')) end
     where id = v_line;
  else
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url, bulk_kind)
    values (
      p_buy_id,
      (select coalesce(max(position), 0) + 1 from buy_lines where buy_id = p_buy_id),
      r.game, r.lang, r.name, r.name_en, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, coalesce(r.first_edition, false),
      coalesce(r.treatments, '[]'::jsonb), r.condition, r.quantity, r.unit_price, r.market_price,
      r.price_source, r.price_snapshot, r.priced_at, r.scryfall_id, r.oracle_id, r.tcgdex_id,
      r.tcgplayer_id, r.justtcg_card_id, r.justtcg_variant_id, r.image_url, r.bulk_kind)
    returning id into v_line;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = p_buy_id;

  -- The copies added, at the card's rate (and on the row, for a folded run's totals).
  select * into v_rec from buy_lines where id = v_line;
  v_rec.quantity := r.quantity;
  perform collection_event(b, p_user, p_device, 'collection_cards_added', array[r.game], (internal.line_counts(array[r])).cards, 0,
    internal.lines_totals(b, array[v_rec]),
    jsonb_build_array(jsonb_build_object('sign', '+', 'qty', r.quantity, 'bulk_per', internal.bulk_per(r.bulk_kind), 'game', r.game,
      'unit_price', r.unit_price, 'text', coalesce(p_text, r.quantity || ' ' || r.name),
      'cash_pct', internal.line_pct(v_rec, b, 'cash'), 'credit_pct', internal.line_pct(v_rec, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[r]) || ' added'));
  perform internal.request_end(p_request, v_line::text);
  return v_line;
end;
$function$;

revoke all on function public.collection_add_line(uuid, jsonb, boolean, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.collection_add_line(uuid, jsonb, boolean, uuid, uuid, integer, text, uuid) to authenticated, service_role;

drop function public.collection_remove_line(uuid, integer, uuid, uuid, integer, text);
CREATE FUNCTION public.collection_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b     buys;
  v_old buy_lines;
  v_n   integer;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Paid/Ours may still lose cards (owner, 2026-09-29); Completed may not.
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.status = 'rejected' then
    raise exception 'collection_rejected';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  -- Exported, or in Can't upload cards: Undo export first (decision 345).
  if v_old.cc_status is not null then
    raise exception 'line_exported';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (and on the row, for a folded run)
  perform collection_event(b, p_user, p_device, 'collection_cards_removed', array[v_old.game], 0, (internal.line_counts(array[v_old])).cards,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'bulk_per', internal.bulk_per(v_old.bulk_kind), 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' removed'));
  perform internal.request_end(p_request, null);
end;
$function$;

revoke all on function public.collection_remove_line(uuid, integer, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.collection_remove_line(uuid, integer, uuid, uuid, integer, text, uuid) to authenticated, service_role;

drop function public.collection_strike_line(uuid, integer, uuid, uuid, integer, text);
CREATE FUNCTION public.collection_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b     buys;
  v_old buy_lines;
  v_n   integer;
  v_id  uuid;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, false);
  if b.system_key is not null then
    raise exception 'system_collection';
  end if;
  if b.project then
    raise exception 'project_no_strike';
  end if;
  if b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  if b.status <> 'paid' then
    raise exception 'strike_paid_only';
  end if;
  if v_old.completed_at is not null then
    raise exception 'line_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform collection_event(b, p_user, p_device, 'collection_cards_struck', array[v_old.game], 0, 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name),
      'cash_pct', internal.line_pct(v_old, b, 'cash'), 'credit_pct', internal.line_pct(v_old, b, 'credit'))),
    '[]', sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the list, crossed out, and never exported'));
  perform internal.request_end(p_request, v_id::text);
  return v_id;
end;
$function$;

revoke all on function public.collection_strike_line(uuid, integer, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.collection_strike_line(uuid, integer, uuid, uuid, integer, text, uuid) to authenticated, service_role;

drop function public.buy_strike_line(uuid, integer, uuid, uuid, integer, text);
CREATE FUNCTION public.buy_strike_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b        buys;
  v_old    buy_lines;
  v_n      integer;
  v_target text;
  v_id     uuid;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return (v_seen ->> 'result')::uuid;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Completed (exported) cards are locked until the day is marked Paid/Ours again.
  if v_old.completed_at is not null then
    raise exception 'buy_completed';
  end if;
  -- A Completed side is locked, its bulk, placeholders and struck cards too (decision 353).
  if exists (select 1 from buy_lines where buy_id = v_old.buy_id and game = v_old.game and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);
  v_id := internal.strike_line(v_old.id, v_n, p_user);
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies struck, at the card's rate
  perform buy_event(b, p_user, p_device, 'buy_cards_struck', v_target, array[v_old.game], 0,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'struck', true, 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(internal.lines_count_text(array[v_old]) || ' struck: kept on the buy, crossed out, and never exported'));
  perform internal.request_end(p_request, v_id::text);
  return v_id;
end;
$function$;

revoke all on function public.buy_strike_line(uuid, integer, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.buy_strike_line(uuid, integer, uuid, uuid, integer, text, uuid) to authenticated, service_role;

drop function public.buy_remove_line(uuid, integer, uuid, uuid, integer, text);
CREATE FUNCTION public.buy_remove_line(p_line_id uuid, p_qty integer, p_user uuid, p_device uuid, p_expected_version integer, p_text text, p_request uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  b        buys;
  v_old    buy_lines;
  v_n      integer;
  v_target text;
begin
  -- This request done already (its answer lost): its answer again, nothing done twice (decision 388).
  v_seen := internal.request_begin(p_request);
  if v_seen is not null then
    return;
  end if;
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'walk_in' and x.status = 'confirmed';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  -- Completed (exported) cards are locked until the day is marked Paid/Ours again.
  if v_old.completed_at is not null then
    raise exception 'buy_completed';
  end if;
  -- A Completed side is locked, its bulk, placeholders and struck cards too (decision 353).
  if exists (select 1 from buy_lines where buy_id = v_old.buy_id and game = v_old.game and completed_at is not null) then
    raise exception 'buy_completed';
  end if;
  select * into b from buys where id = v_old.buy_id for update;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_n := least(greatest(coalesce(p_qty, 1), 1), v_old.quantity);
  if v_n >= v_old.quantity
     and not exists (select 1 from buy_lines where buy_id = b.id and id <> p_line_id) then
    raise exception 'last_card';
  end if;

  -- Named as it stood before the change.
  v_target := buy_target_name(b.id);

  if v_n >= v_old.quantity then
    delete from buy_lines where id = p_line_id;
  else
    update buy_lines set quantity = quantity - v_n where id = p_line_id;
  end if;
  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  v_old.quantity := v_n;   -- the copies removed, at the card's rate (lines_totals)
  perform buy_event(b, p_user, p_device, 'buy_cards_removed', v_target, array[v_old.game], (internal.line_counts(array[v_old])).cards,
    internal.lines_totals(b, array[v_old]),
    jsonb_build_array(jsonb_build_object('sign', '-', 'qty', v_n, 'game', v_old.game,
      'unit_price', v_old.unit_price, 'text', coalesce(p_text, v_n || ' ' || v_old.name))),
    sentence(internal.lines_count_text(array[v_old]) || ' removed from a confirmed buy'));
  perform internal.request_end(p_request, null);
end;
$function$;

revoke all on function public.buy_remove_line(uuid, integer, uuid, uuid, integer, text, uuid) from public, anon;
grant execute on function public.buy_remove_line(uuid, integer, uuid, uuid, integer, text, uuid) to authenticated, service_role;

drop function public.collection_create(text, text, text, uuid, uuid, text);
CREATE FUNCTION public.collection_create(p_name text, p_phone text, p_notes text, p_user uuid, p_device uuid, p_id_last4 text DEFAULT NULL::text, p_request uuid DEFAULT NULL::uuid)
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

revoke all on function public.collection_create(text, text, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.collection_create(text, text, text, uuid, uuid, text, uuid) to authenticated, service_role;

drop function public.project_create(text, text, uuid, uuid);
CREATE FUNCTION public.project_create(p_name text, p_notes text, p_user uuid, p_device uuid, p_request uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_seen   jsonb;
  v_name  text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_notes text := btrim(coalesce(p_notes, ''));
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

  insert into buys (kind, status, project, customer_name, phone, notes, paid_at, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, null, v_notes, now(), p_user, p_user)
  returning * into b;

  perform collection_event(b, p_user, p_device, 'collection_created', '{}', 0, 0, null, '[]',
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name))
    || case when v_notes <> ''
            then jsonb_build_array(jsonb_build_object('field', 'notes', 'before', null, 'after', v_notes))
            else '[]'::jsonb end,
    sentence(format('Project started: %s', v_name)));
  perform internal.request_end(p_request, b.id::text);
  return b.id;
end;
$function$;

revoke all on function public.project_create(text, text, uuid, uuid, uuid) from public, anon;
grant execute on function public.project_create(text, text, uuid, uuid, uuid) to authenticated, service_role;

-- ------------------------------------------------- 391: an edit keeps the scans its line came from
-- The app's edit sends a fresh price snapshot, which has no scan in it, and lines folded together
-- kept only the surviving line's: a scan claimed again later couldn't find its line and was
-- added twice (lineOfScan, decision 351). Now both carry over, in the snapshot's "scans".

-- Every scan a line came from: its own (scan.scan_id) and those merged into it (scans).
create function internal.scan_ids(p_snapshot jsonb)
returns jsonb
language sql
immutable
set search_path = public, internal, pg_temp
as $$
  select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
    from (select p_snapshot -> 'scan' ->> 'scan_id' as x
          union all
          select jsonb_array_elements_text(case when jsonb_typeof(p_snapshot -> 'scans') = 'array'
                                                then p_snapshot -> 'scans' else '[]'::jsonb end)) t
   where x is not null;
$$;
revoke all on function internal.scan_ids(jsonb) from public, anon;
grant execute on function internal.scan_ids(jsonb) to authenticated, service_role;

-- The snapshot, remembering these scans too; its own scan stays where it is.
create function internal.with_scans(p_snapshot jsonb, p_ids jsonb)
returns jsonb
language sql
immutable
set search_path = public, internal, pg_temp
as $$
  select case
    when not exists (select 1 from jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb)) i
                      where i.value is distinct from p_snapshot -> 'scan' ->> 'scan_id')
      then p_snapshot
    else jsonb_set(coalesce(p_snapshot, '{}'::jsonb), '{scans}',
           (select coalesce(jsonb_agg(distinct x), '[]'::jsonb)
              from (select jsonb_array_elements_text(case when jsonb_typeof(p_snapshot -> 'scans') = 'array'
                                                          then p_snapshot -> 'scans' else '[]'::jsonb end) as x
                    union all
                    select jsonb_array_elements_text(coalesce(p_ids, '[]'::jsonb))) t
             where x is distinct from p_snapshot -> 'scan' ->> 'scan_id'))
  end;
$$;
revoke all on function internal.with_scans(jsonb, jsonb) from public, anon;
grant execute on function internal.with_scans(jsonb, jsonb) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.draft_update_line(p_line_id uuid, p_line jsonb, p_user uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_buy   uuid;
  v_pos   integer;
  v_other uuid;
  v_opos  integer;
  v_snap  jsonb;
  r       buy_lines;
begin
  select l.buy_id, l.position, l.price_snapshot into v_buy, v_pos, v_snap
    from buy_lines l join buys b on b.id = l.buy_id
   where l.id = p_line_id and b.status = 'draft'
   for update of l;
  if v_buy is null then
    raise exception 'line_gone';   -- removed, confirmed or cancelled meanwhile
  end if;

  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  update buy_lines set
    game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
    set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
    collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
    finish = r.finish, first_edition = coalesce(r.first_edition, false),
    treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
    quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
    -- The scans the line came from stay with it (decision 391).
    price_source = r.price_source, price_snapshot = internal.with_scans(r.price_snapshot, internal.scan_ids(v_snap)), priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_buy and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_pos then
      update buy_lines o
         set quantity = o.quantity + r.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(e.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, e.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, e.custom_credit_pct)
        from buy_lines e
       where o.id = v_other and e.id = p_line_id;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines o
         set quantity = o.quantity + x.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(x.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, x.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, x.custom_credit_pct)
        from buy_lines x
       where o.id = p_line_id and x.id = v_other;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_buy;
  return p_line_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.collection_update_line(p_line_id uuid, p_line jsonb, p_user uuid, p_device uuid, p_expected_version integer, p_old_text text, p_new_text text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b       buys;
  v_old   buy_lines;
  v_other uuid;
  v_opos  integer;
  r       buy_lines;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select l.* into v_old
    from buy_lines l join buys x on x.id = l.buy_id
   where l.id = p_line_id and x.kind = 'collection';
  if v_old.id is null then
    raise exception 'line_gone';
  end if;
  b := collection_for_write(v_old.buy_id, p_device, p_expected_version, true);
  if v_old.struck_at is not null then
    raise exception 'line_struck';
  end if;
  if v_old.cc_status is not null then
    raise exception 'line_exported';   -- frozen (decision 345)
  end if;

  r := jsonb_populate_record(null::buy_lines, p_line);
  if r.quantity is null or r.quantity < 1 then
    raise exception 'quantity must be at least 1';
  end if;

  update buy_lines set
    game = r.game, lang = r.lang, name = r.name, name_en = r.name_en, name_key = r.name_key,
    set_code = r.set_code, set_name = r.set_name, source_set_id = r.source_set_id,
    collector_number = r.collector_number, printed_size = r.printed_size, rarity = r.rarity,
    finish = r.finish, first_edition = coalesce(r.first_edition, false),
    treatments = coalesce(r.treatments, '[]'::jsonb), condition = r.condition,
    quantity = r.quantity, unit_price = r.unit_price, market_price = r.market_price,
    -- The scans the line came from stay with it (decision 391).
    price_source = r.price_source, price_snapshot = internal.with_scans(r.price_snapshot, internal.scan_ids(v_old.price_snapshot)), priced_at = r.priced_at,
    scryfall_id = r.scryfall_id, oracle_id = r.oracle_id, tcgdex_id = r.tcgdex_id,
    tcgplayer_id = r.tcgplayer_id, justtcg_card_id = r.justtcg_card_id,
    justtcg_variant_id = r.justtcg_variant_id, image_url = r.image_url,
      bulk_kind = r.bulk_kind
  where id = p_line_id;

  select l.id, l.position into v_other, v_opos from buy_lines l
   where l.buy_id = v_old.buy_id and l.id <> p_line_id
     and internal.same_card(l, r)   -- the same printing at the same price (0065)
     and l.struck_at is null   -- never into a struck line
     and l.cc_status is null   -- nor fold an exported one (decision 345)
   order by l.position
   limit 1;

  if v_other is not null then
    if v_opos < v_old.position then
      update buy_lines o
         set quantity = o.quantity + r.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(e.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, e.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, e.custom_credit_pct)
        from buy_lines e
       where o.id = v_other and e.id = p_line_id;
      delete from buy_lines where id = p_line_id;
      p_line_id := v_other;
    else
      update buy_lines o
         set quantity = o.quantity + x.quantity,
             price_snapshot = internal.with_scans(o.price_snapshot, internal.scan_ids(x.price_snapshot)),
             custom_cash_pct = coalesce(o.custom_cash_pct, x.custom_cash_pct),
             custom_credit_pct = coalesce(o.custom_credit_pct, x.custom_credit_pct)
        from buy_lines x
       where o.id = p_line_id and x.id = v_other;
      delete from buy_lines where id = v_other;
    end if;
  end if;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = v_old.buy_id;

  perform collection_event(b, p_user, p_device, 'collection_line_edited',
    (select array_agg(distinct g order by g) from unnest(array[v_old.game, r.game]) g),
    r.quantity, v_old.quantity, null,
    jsonb_build_array(
      jsonb_build_object('sign', '-', 'qty', v_old.quantity, 'game', v_old.game, 'unit_price', v_old.unit_price,
        'text', coalesce(p_old_text, v_old.quantity || ' ' || v_old.name)),
      jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', r.game, 'unit_price', r.unit_price,
        'text', coalesce(p_new_text, r.quantity || ' ' || r.name))),
    '[]', 'Card edited.');
  return p_line_id;
end;
$function$;

-- ------------------------------------- 393: Convert leaves a Completed side whole; 397: the kept buy
-- A game whose cards are Completed is locked whole (decision 353), but Convert moved its bulk and
-- placeholders off the buy (they're never Completed themselves). Now a Completed game's lines all
-- stay. And the new project or collection, paid $0 while the buy keeps the payment (decision 341),
-- remembers that buy, so marking it Paid/Ours again can say where the payment is.
alter table public.buys add column kept_buy_id uuid;
comment on column public.buys.kept_buy_id is
  'A project or collection made from a walk-in buy that stayed and kept the payment (decision 397). No foreign key: a restore inserts buys in any order; a buy gone since just isn''t found.';

CREATE OR REPLACE FUNCTION public.buy_to_project(p_buy_id uuid, p_name text, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v_name   text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  b        buys;
  p        buys;
  v_target text;
  v_games  text[];
  v_count  integer;
  v_market numeric;
  v_lines  jsonb;
  v_struck jsonb;
  v_gone   integer;
  v_keep   boolean;
  v_done   text[];
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  -- Completed cards are skipped, not a refusal (owner, 2026-10-18; decision 296):
  -- the live cards move; with Completed cards left, the buy stays on its day.
  -- A game with Completed cards stays whole on the buy: its bulk, placeholders and struck cards too (decision 393).
  v_done := array(select distinct game from buy_lines where buy_id = b.id and completed_at is not null);
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g), sum(q), sum(m)
    into v_games, v_count, v_market
    from (select game as g, sum(quantity) filter (where struck_at is null) as q,
                 sum(unit_price * quantity) filter (where struck_at is null) as m
            from buy_lines where buy_id = b.id and completed_at is null and not (game = any(v_done)) group by game) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
  -- Struck cards stay out of the project, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null and not (game = any(v_done));

  -- The buy's phone, and its user as the project's maker: the Cash buys file
  -- names who bought it (owner, 2026-10-02).
  insert into buys (kind, status, project, customer_name, phone, notes, paid_at,
                    cash_pct, credit_pct, paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', true, v_name, b.phone, coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          null, null,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;
  -- The buy kept the payment: remembered, for Mark Paid/Ours again (decision 397).
  if v_keep and b.paid_method is not null then
    update buys set kept_buy_id = b.id where id = p.id returning * into p;
  end if;

  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
  -- Projects are the store's own cards: no rates (owner, 2026-10-15).
  update buy_lines set custom_cash_pct = null, custom_credit_pct = null, cash_pct = null, credit_pct = null where buy_id = p.id;

  -- One entry: the cards added to the new project (owner, 2026-10-02).
  perform collection_event(p, p_user, p_device, 'buy_converted', coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = p.id))).cards, 0, internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name)),
    sentence(format('Project started from %s: %s', v_target, v_name)
             || case when v_gone > 0
                     then '; ' || internal.lines_count_text(array(select l from buy_lines l
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null
                                                                    and not (l.game = any(v_done))),
                                                            'struck') || case when v_keep then ' stay on the buy' else ' left out' end
                     else '' end
             || case when v_keep then '; its Completed cards stay on the buy' else '' end));

  if v_keep then
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;
  else
    delete from buys where id = b.id;
  end if;
  return p.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.buy_to_collection(p_buy_id uuid, p_user uuid, p_device uuid, p_expected_version integer DEFAULT NULL::integer, p_line_texts jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  b        buys;
  p        buys;
  v_name   text;
  v_target text;
  v_games  text[];
  v_lines  jsonb;
  v_struck jsonb;
  v_gone   integer;
  v_keep   boolean;
  v_done   text[];
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  select * into b from buys where id = p_buy_id and kind = 'walk_in' and status = 'confirmed' for update;
  if b.id is null then
    raise exception 'buy_gone';
  end if;
  v_name := btrim(regexp_replace(coalesce(b.customer_name, ''), '\s+', ' ', 'g'));
  if char_length(v_name) not between 1 and 80 then
    raise exception 'bad_name';
  end if;
  -- A game with Completed cards stays whole on the buy: its bulk, placeholders and struck cards too (decision 393).
  v_done := array(select distinct game from buy_lines where buy_id = b.id and completed_at is not null);
  if not exists (select 1 from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) then
    raise exception 'buy_completed';
  end if;
  v_keep := exists (select 1 from buy_lines where buy_id = b.id and completed_at is not null);
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;

  v_target := buy_target_name(b.id);
  select array_agg(g order by g = 'pokemon', g)
    into v_games
    from (select distinct game as g from buy_lines where buy_id = b.id and completed_at is null and struck_at is null
                   and not (game = any(v_done))) t;
  select jsonb_agg(jsonb_build_object(
           'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position)
    into v_lines
    from buy_lines where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));
  -- Struck cards stay out of the collection, crossed out in its entry.
  select jsonb_agg(jsonb_build_object(
           'sign', '-', 'struck', true, 'qty', quantity, 'game', game, 'unit_price', unit_price,
           'text', coalesce(p_line_texts ->> id::text, quantity || ' ' || name))
         order by game = 'pokemon', position), sum(quantity)
    into v_struck, v_gone
    from buy_lines where buy_id = b.id and struck_at is not null and completed_at is null and not (game = any(v_done));

  -- The buy's customer, phone, notes, payment and rates; its user as the maker.
  insert into buys (kind, status, project, customer_name, phone, id_last4, notes, paid_at,
                    cash_pct, credit_pct, custom_cash_pct, custom_credit_pct,
                    paid_price, paid_method, created_by, last_edited_by)
  values ('collection', 'paid', false, v_name, b.phone, '1312', coalesce(b.notes, ''), coalesce(b.confirmed_at, now()),
          b.cash_pct, b.credit_pct, b.custom_cash_pct, b.custom_credit_pct,
          -- Paid once: while the buy stays it keeps the payment, $0 here (decision 341).
          case when v_keep and b.paid_method is not null then 0 else b.paid_price end, b.paid_method,
          coalesce(b.confirmed_by, p_user), p_user)
  returning * into p;
  -- The buy kept the payment: remembered, for Mark Paid/Ours again (decision 397).
  if v_keep and b.paid_method is not null then
    update buys set kept_buy_id = b.id where id = p.id returning * into p;
  end if;

  -- The cards keep the rates CONFIRM BUY saved on them.
  update buy_lines set buy_id = p.id where buy_id = b.id and struck_at is null and completed_at is null and not (game = any(v_done));

  perform collection_event(p, p_user, p_device, 'buy_converted_collection', coalesce(v_games, '{}'),
    (internal.line_counts(array(select l from buy_lines l where l.buy_id = p.id))).cards, 0,
    internal.lines_totals(p, array(select l from buy_lines l where l.buy_id = p.id)),
    (select coalesce(jsonb_agg(x || jsonb_build_object('sign', '+')), '[]'::jsonb) from jsonb_array_elements(v_lines) x)
      || coalesce(v_struck, '[]'::jsonb),
    jsonb_build_array(jsonb_build_object('field', 'name', 'before', null, 'after', v_name),
                      jsonb_build_object('field', 'last 4 ID', 'before', null, 'after', '1312')),
    sentence(format('Collection started from %s: %s', v_target, v_name)
             || case when v_gone > 0
                     then '; ' || internal.lines_count_text(array(select l from buy_lines l
                                                                  where l.buy_id = b.id and l.struck_at is not null and l.completed_at is null
                                                                    and not (l.game = any(v_done))),
                                                            'struck') || case when v_keep then ' stay on the buy' else ' left out' end
                     else '' end
             || case when v_keep then '; its Completed cards stay on the buy' else '' end));

  if v_keep then
    update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;
  else
    delete from buys where id = b.id;
  end if;
  return p.id;
end;
$function$;

-- ------------------------------------------------------------- 394: a new key's first save, once
CREATE OR REPLACE FUNCTION public.settings_save(p_key text, p_value jsonb, p_user uuid, p_expected timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO 'public', 'internal'
AS $function$
declare
  v settings;
  v_at timestamptz := clock_timestamp();   -- not the transaction's start: two saves in one never look alike
begin
  select * into v from settings where key = p_key for update;
  if (v.key is null and p_expected is not null) or (v.key is not null and v.updated_at is distinct from p_expected) then
    raise exception 'settings_changed';
  end if;
  if v.key is null then
    -- A new key's first save: two at once both found no row. The second one's insert waits for
    -- the first's, then is refused like any out-of-date save (decision 394).
    insert into settings (key, value, updated_at, updated_by) values (p_key, p_value, v_at, p_user)
    on conflict (key) do nothing;
    if not found then
      raise exception 'settings_changed';
    end if;
  else
    update settings set value = p_value, updated_at = v_at, updated_by = p_user where key = p_key;
  end if;
  return v_at;
end;
$function$;

-- ------------------------------------------------------------------------- 398: restore edges
CREATE OR REPLACE FUNCTION public.restore_backup(p_payload jsonb, p_file text, p_user uuid, p_device uuid, p_typed text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t jsonb := p_payload -> 'tables';
  v_user staff_users;
  v_counts jsonb;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_typed is distinct from 'RESTORE' then raise exception 'not_confirmed'; end if;
  if p_payload ->> 'format' is distinct from 'pug-pricing-backup'
     or (p_payload ->> 'version') is distinct from '1'
     or jsonb_typeof(t) is distinct from 'object'
     or jsonb_typeof(t -> 'staff_users') is distinct from 'array'
     or jsonb_typeof(t -> 'devices') is distinct from 'array'
     or jsonb_typeof(t -> 'buys') is distinct from 'array'
     or jsonb_typeof(t -> 'buy_lines') is distinct from 'array'
     or jsonb_typeof(t -> 'events') is distinct from 'array'
     or jsonb_typeof(t -> 'settings') is distinct from 'array' then
    raise exception 'bad_backup';
  end if;

  lock table buys, buy_lines, events, staff_users, settings, collection_locks, customers,
             cc_set_map, cc_product_links, import_links in exclusive mode;

  -- Out with the old: locks, buys and collections (their lines go with them),
  -- the customers, the changelog, and every setting but when the last backup was taken.
  delete from collection_locks;
  delete from buys;
  delete from customers;
  delete from events;
  update settings set updated_by = null where key = 'last_backup_at';
  delete from settings where key <> 'last_backup_at';

  -- Staff users: all hidden, then the backup's put back as they were.
  update staff_users set active = false where active;
  perform restore_rows('staff_users', t -> 'staff_users',
    'on conflict (id) do update set name = excluded.name, color = excluded.color, '
    || 'active = excluded.active, created_at = excluded.created_at');
  -- Computers: the backup's are added; the ones here keep their names.
  perform restore_rows('devices', t -> 'devices', 'on conflict (id) do nothing');

  perform restore_rows('buys', t -> 'buys');
  perform restore_rows('buy_lines', t -> 'buy_lines');
  perform restore_rows('events', t -> 'events');
  perform setval(pg_get_serial_sequence('public.events', 'seq'),
                 greatest(coalesce((select max(seq) from events), 0), 1));
  -- Buy numbers carry on past the restored ones (decision 348): in a new project they'd start
  -- at 1 and collide. Numbers used after the backup was made can't be known: see SETUP.md.
  if exists (select 1 from buys where number is not null) then
    perform setval('public.buys_number_seq',
                   greatest((select max(number) from buys),
                            (select case when is_called then last_value else last_value - 1 end from public.buys_number_seq)),
                   true);
  end if;
  -- The learned matches, when the file has them (decision 348; older backups don't). An empty list
  -- leaves what's here: a hand-edited file shouldn't empty what staff taught (decision 398).
  if jsonb_typeof(t -> 'cc_set_map') = 'array' and jsonb_array_length(t -> 'cc_set_map') > 0 then
    delete from cc_set_map;
    perform restore_rows('cc_set_map', t -> 'cc_set_map');
  end if;
  if jsonb_typeof(t -> 'cc_product_links') = 'array' and jsonb_array_length(t -> 'cc_product_links') > 0 then
    delete from cc_product_links;
    perform restore_rows('cc_product_links', t -> 'cc_product_links');
  end if;
  if jsonb_typeof(t -> 'import_links') = 'array' and jsonb_array_length(t -> 'import_links') > 0 then
    delete from import_links;
    perform restore_rows('import_links', t -> 'import_links');
  end if;
  perform restore_rows('settings',
    (select coalesce(jsonb_agg(r), '[]'::jsonb) from jsonb_array_elements(t -> 'settings') r
      where r ->> 'key' <> 'last_backup_at'));

  -- The milestone (spec 12): always shown on the line.
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'app', 'backup_restored',
          p_file, 'Backup restored — ' || coalesce(nullif(btrim(p_file), ''), 'backup file'));

  select backup_counts() into v_counts;
  return v_counts;
end;
$function$;

-- The columns a backup's tables have here: the restore dialog lists any of the file's that the
-- database lacks, which a restore leaves out (decision 398).
create function public.backup_columns()
returns jsonb
language sql
stable
set search_path = public, internal, pg_temp
as $$
  select coalesce(jsonb_object_agg(table_name, cols), '{}'::jsonb)
    from (select table_name::text, jsonb_agg(column_name::text order by ordinal_position) as cols
            from information_schema.columns
           where table_schema = 'public'
             and table_name in ('staff_users', 'devices', 'buys', 'buy_lines', 'events', 'settings',
                                'cc_set_map', 'cc_product_links', 'import_links')
           group by table_name) t;
$$;
revoke all on function public.backup_columns() from public, anon;
grant execute on function public.backup_columns() to authenticated, service_role;
