-- Export Phase E3 (docs/EXPORT_FUNCTION.md 6.4, 8.4, 9.4): what each card
-- exported as, the export of a day in one transaction, and its undo.

-- What each card exported as (spec 6.4). A re-download rebuilds the same file
-- from these stamps; undo clears them.
alter table public.buy_lines
  add column cc_status       text check (cc_status in ('exported', 'cant_upload')),
  add column cc_product_id   text,
  add column cc_product_name text,
  add column cc_category     text,
  add column cc_condition    text,
  add column cc_sell_price   numeric(10,2) check (cc_sell_price >= 0),
  add column cc_sell_basis   jsonb,
  add column cc_custom_sku   text,
  add column cc_exported_at  timestamptz,
  -- Only on lines in the Can't upload cards collection (Phase E4): the card's
  -- line in its original buy or collection.
  add column source_line_id  uuid references public.buy_lines (id) on delete set null;
create index buy_lines_source_line on public.buy_lines (source_line_id) where source_line_id is not null;

-- ---------------------------------------------------------------------------
-- cc_custom_sku: the export's code (spec 4.4), its date in store time with
-- no leading zero on the month, the day always two digits, a two-digit year:
-- 06/17/26 → 61726, 11/01/26 → 110126. The same as the app's customSkuFor.
-- ---------------------------------------------------------------------------
create or replace function public.cc_custom_sku(p_at timestamptz default now()) returns text
language sql stable
set search_path = public
as $$
  select to_char(p_at at time zone 'America/Los_Angeles', 'FMMMDDYY');
$$;

-- CC's condition words, exactly as its help page writes them (spec 3.1).
create or replace function public.cc_condition_word(p_condition text) returns text
language sql immutable
set search_path = public
as $$
  select case p_condition
    when 'NM' then 'Near Mint' when 'LP' then 'Light Play' when 'MP' then 'Moderate Play'
    when 'HP' then 'Heavy Play' when 'DMG' then 'Damaged' end;
$$;

-- ---------------------------------------------------------------------------
-- export_lines: the export itself, in one transaction (spec 8.4).
--   p_target   { kind: 'day', day: '2026-09-30', game: 'mtg',
--                versions: { <buy id>: <version>, … } }  (the buys as the dialog saw them)
--   p_matches  [{ line_id, product_id, sell_price, sell_basis, link: 'staff'|'auto'|null }]
--   p_cant     the lines that can't upload
--   p_set_maps [{ scryfall_set, promo_kind, category }]: staff's "Always use … for …"
-- Every one of the target's Paid/Ours Magic lines must be in p_matches or
-- p_cant, exactly once; else stale_version and nothing changes. The product's
-- name and category are copied from the current inventory here, so the file
-- always has CC's exact text. Returns the counts, the Custom SKU and the
-- stamped lines, for the file.
-- ---------------------------------------------------------------------------
create or replace function public.export_lines(
  p_target   jsonb,
  p_matches  jsonb,
  p_cant     uuid[],
  p_set_maps jsonb,
  p_user     uuid,
  p_device   uuid
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_kind     text := p_target ->> 'kind';
  v_day      date;
  v_game     text;
  v_game_name text;
  v_file     uuid := cc_current_file();
  v_sku      text := cc_custom_sku(now());
  v_buys     uuid[];
  v_lines    uuid[];
  v_given    uuid[];
  v_cards    integer;
  v_cant     integer;
  v_user     staff_users;
begin
  if p_user is null then raise exception 'no_user'; end if;
  p_matches := coalesce(p_matches, '[]'::jsonb);
  p_cant := coalesce(p_cant, '{}'::uuid[]);
  if v_kind is distinct from 'day' then raise exception 'bad_target'; end if;

  v_day := (p_target ->> 'day')::date;
  v_game := p_target ->> 'game';
  -- Magic only (owner, 2026-09-30; spec 1.3).
  if v_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
  if v_game is distinct from 'mtg' or v_day is null then raise exception 'bad_day'; end if;
  v_game_name := 'Magic';
  -- Today can't be exported (owner, 2026-09-30).
  if v_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;
  if v_file is null or not exists (select 1 from cc_products where file_id = v_file) then
    raise exception 'no_inventory';
  end if;

  -- The day's buys, locked, then those with this game's cards still Paid/Ours.
  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
   for update;
  select array_agg(b.id) into v_buys
    from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = v_day
     and exists (select 1 from buy_lines l where l.buy_id = b.id and l.game = v_game and l.completed_at is null);
  if v_buys is null then raise exception 'nothing_to_export'; end if;
  -- Nothing changed since the dialog opened.
  if exists (select 1 from buys b where b.id = any(v_buys)
              and (p_target -> 'versions' ->> b.id::text)::integer is distinct from b.version)
     or (select count(*) from jsonb_object_keys(coalesce(p_target -> 'versions', '{}'::jsonb)))
        <> array_length(v_buys, 1) then
    raise exception 'stale_version';
  end if;

  select array_agg(l.id) into v_lines
    from buy_lines l where l.buy_id = any(v_buys) and l.game = v_game and l.completed_at is null;
  select array_agg(x) into v_given from (
    select (e ->> 'line_id')::uuid as x from jsonb_array_elements(p_matches) e
    union all
    select unnest(p_cant)) s;
  if v_given is null
     or array_length(v_given, 1) <> (select count(distinct x) from unnest(v_given) x)
     or not (v_given @> v_lines and v_lines @> v_given) then
    raise exception 'stale_version';
  end if;

  -- Every product still in the current inventory (it may have been replaced
  -- while the dialog was open), and every Sell Price at least the floor.
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where not exists (select 1 from cc_products p
                                 where p.file_id = v_file and p.product_id = e ->> 'product_id')) then
    raise exception 'stale_inventory';
  end if;
  if exists (select 1 from jsonb_array_elements(p_matches) e
              where (e ->> 'sell_price') is null or (e ->> 'sell_price')::numeric < 0.40) then
    raise exception 'bad_price';
  end if;

  -- The stamps (spec 6.4), and Completed.
  update buy_lines l set
    cc_status       = 'exported',
    cc_product_id   = p.product_id,
    cc_product_name = p.product_name,
    cc_category     = p.category,
    cc_condition    = cc_condition_word(l.condition),
    cc_sell_price   = round((e ->> 'sell_price')::numeric, 2),
    cc_sell_basis   = e -> 'sell_basis',
    cc_custom_sku   = v_sku,
    cc_exported_at  = now(),
    completed_at    = now(),
    completed_by    = p_user
  from jsonb_array_elements(p_matches) e
  join cc_products p on p.file_id = v_file and p.product_id = e ->> 'product_id'
  where l.id = (e ->> 'line_id')::uuid;
  update buy_lines set
    cc_status = 'cant_upload', cc_exported_at = now(), completed_at = now(), completed_by = p_user
  where id = any(p_cant);

  -- What staff taught the matcher, and the automatic matches that exported.
  insert into cc_product_links (scryfall_id, finish, product_id, product_name, category, source, linked_at, linked_by)
  select distinct on (l.scryfall_id, l.finish)
         l.scryfall_id, l.finish, p.product_id, p.product_name, p.category, e ->> 'link', now(), p_user
    from jsonb_array_elements(p_matches) e
    join buy_lines l on l.id = (e ->> 'line_id')::uuid
    join cc_products p on p.file_id = v_file and p.product_id = e ->> 'product_id'
   where e ->> 'link' in ('staff', 'auto')
     and l.scryfall_id is not null and l.finish in ('nonfoil', 'foil', 'etched')
   order by l.scryfall_id, l.finish, (e ->> 'link') = 'staff' desc
  on conflict (scryfall_id, finish) do update set
    product_id = excluded.product_id, product_name = excluded.product_name, category = excluded.category,
    source = excluded.source, linked_at = excluded.linked_at, linked_by = excluded.linked_by;
  insert into cc_set_map (scryfall_set, promo_kind, category, source, updated_at, updated_by)
  select distinct on (lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''))
         lower(s ->> 'scryfall_set'), coalesce(s ->> 'promo_kind', ''), s ->> 'category', 'staff', now(), p_user
    from jsonb_array_elements(coalesce(p_set_maps, '[]'::jsonb)) s
   where coalesce(s ->> 'scryfall_set', '') <> ''
     and coalesce(s ->> 'promo_kind', '') in ('', 'prerelease', 'promopack')
     and exists (select 1 from cc_products p where p.file_id = v_file and p.category = s ->> 'category')
  on conflict (scryfall_set, promo_kind) do update set
    category = excluded.category, source = 'staff', updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  update buys set version = version + 1, updated_at = now() where id = any(v_buys);

  select coalesce(sum(quantity) filter (where cc_status = 'exported'), 0),
         coalesce(sum(quantity) filter (where cc_status = 'cant_upload'), 0)
    into v_cards, v_cant
    from buy_lines where id = any(v_lines);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
          v_game_name || ' · ' || to_char(v_day, 'FMMonth FMDD, YYYY'), array[v_game], v_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
          format('%s %s card%s exported (Custom SKU %s)%s.', v_cards, v_game_name,
                 case when v_cards = 1 then '' else 's' end, v_sku,
                 case when v_cant > 0 then format('; %s can''t upload', v_cant) else '' end));

  return jsonb_build_object(
    'buys', array_length(v_buys, 1),
    'cards', v_cards,
    'cant', v_cant,
    'sku', v_sku,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'id', l.id, 'quantity', l.quantity, 'cc_status', l.cc_status,
                'cc_product_name', l.cc_product_name, 'cc_category', l.cc_category,
                'cc_condition', l.cc_condition, 'cc_sell_price', l.cc_sell_price,
                'cc_custom_sku', l.cc_custom_sku)), '[]'::jsonb)
                from buy_lines l where l.id = any(v_lines)));
end;
$$;

-- ---------------------------------------------------------------------------
-- export_undo_day: ⋯ → Mark Paid/Ours again (spec 9.4). That game's
-- Completed cards on the day go back to Paid/Ours, and their export stamps
-- are cleared, so the buy prices show again. Returns how many buys changed.
-- ---------------------------------------------------------------------------
create or replace function public.export_undo_day(
  p_day    date,
  p_game   text,
  p_user   uuid,
  p_device uuid
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;

  perform 1 from buys b
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
   for update;
  select array_agg(distinct b.id) into v_ids
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is not null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  update buy_lines set
    completed_at = null, completed_by = null,
    cc_status = null, cc_product_id = null, cc_product_name = null, cc_category = null,
    cc_condition = null, cc_sell_price = null, cc_sell_basis = null, cc_custom_sku = null,
    cc_exported_at = null
  where buy_id = any(v_ids) and game = p_game and completed_at is not null;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_unexported',
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Completed', 'after', 'Paid/Ours')),
          format('%s %s buy%s marked Paid/Ours again.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end));
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- day_mark stays for the older live build (v0.9.1), whose EXPORT only marks a
-- day Completed. Putting a day back now goes through export_undo_day, so the
-- stamps are cleared whichever build does it.
-- ---------------------------------------------------------------------------
create or replace function public.day_mark(
  p_day      date,
  p_game     text,
  p_user     uuid,
  p_device   uuid,
  p_complete boolean
) returns integer
language plpgsql
set search_path = public
as $$
declare
  v_user  staff_users;
  v_ids   uuid[];
  v_count integer;
  v_game  text := case p_game when 'mtg' then 'Magic' when 'pokemon' then 'Pokémon' end;
begin
  if p_user is null then raise exception 'no_user'; end if;
  if v_game is null or p_day is null then raise exception 'bad_day'; end if;
  if not p_complete then
    return export_undo_day(p_day, p_game, p_user, p_device);
  end if;
  -- Pokémon can't be exported yet (owner, 2026-09-30; export spec 1.3).
  if p_game = 'pokemon' then raise exception 'pokemon_export_unavailable'; end if;
  -- The day isn't over: buys confirmed later would miss the export.
  if p_day >= (now() at time zone 'America/Los_Angeles')::date then raise exception 'day_not_over'; end if;

  select array_agg(distinct b.id) into v_ids
    from buys b join buy_lines l on l.buy_id = b.id
   where b.kind = 'walk_in' and b.status = 'confirmed'
     and (b.confirmed_at at time zone 'America/Los_Angeles')::date = p_day
     and l.game = p_game and l.completed_at is null;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count = 0 then return 0; end if;

  update buy_lines set completed_at = now(), completed_by = p_user
   where buy_id = any(v_ids) and game = p_game and completed_at is null;
  update buys set version = version + 1, updated_at = now() where id = any(v_ids);

  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, games, day, fields, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'day_exported',
          v_game || ' · ' || to_char(p_day, 'FMMonth FMDD, YYYY'), array[p_game], p_day,
          jsonb_build_array(jsonb_build_object('field', 'status', 'before', 'Paid/Ours', 'after', 'Completed')),
          format('%s %s buy%s exported and marked Completed.', v_count, v_game,
                 case when v_count = 1 then '' else 's' end));
  return v_count;
end;
$$;

revoke execute on function
  public.cc_custom_sku(timestamptz), public.cc_condition_word(text),
  public.export_lines(jsonb, jsonb, uuid[], jsonb, uuid, uuid),
  public.export_undo_day(date, text, uuid, uuid)
from public, anon;
grant execute on function
  public.cc_custom_sku(timestamptz), public.cc_condition_word(text),
  public.export_lines(jsonb, jsonb, uuid[], jsonb, uuid, uuid),
  public.export_undo_day(date, text, uuid, uuid)
to authenticated;
