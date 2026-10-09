-- Import Collection (owner, 2026-10-09): a Mass Create CSV (the store's
-- CardBot writes them; so does our own EXPORT) read back into the app, each
-- row matched to its exact Magic printing (the export's matching run in
-- reverse), as a new project, or into an empty collection or project. The
-- matching happens in the browser (importMatch.js); this saves the result.
--
--   price_source 'import'  each card's price is the file's Sell Price, until
--                          REPRICE? (not a manual price: the export works its
--                          Sell Price out fresh, as for any other card)
--   import_links           staff's picks, by the file's product name and
--                          category, so the next file with that row matches
--                          straight away
--   project_import         + a new project with the file's cards
--   collection_import      the file's cards into an empty collection or
--                          project (one with no cards at all: nothing is ever
--                          replaced), by the computer editing it
-- Both log one changelog entry, `collection_imported`, with every card.

alter table public.buy_lines drop constraint buy_lines_price_source_check;
alter table public.buy_lines add constraint buy_lines_price_source_check check (price_source in
  ('justtcg', 'justtcg_fallback', 'scryfall_fallback', 'tcgdex_fallback', 'cardmarket', 'manual', 'import'));

create table public.import_links (
  key           text primary key,                    -- folded category | product name, spaces collapsed, lower case
  category      text not null,                       -- as in the file
  product_name  text not null,                       -- as in the file
  scryfall_id   text not null,
  finish        text not null check (finish in ('nonfoil', 'foil', 'etched')),
  linked_at     timestamptz not null default now(),
  linked_by     uuid references public.staff_users (id) on delete set null
);
alter table public.import_links enable row level security;
revoke all on public.import_links from anon;
grant select, insert, update, delete on public.import_links to authenticated;
create policy "store: full access" on public.import_links for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- The lines themselves, into a collection with none: one changelog entry.
-- Each line is a buy_lines row as JSON (importCollection.js), plus `text`, the
-- line as the changelog shows it.
-- ---------------------------------------------------------------------------
create or replace function internal.import_lines(
  b       buys,
  p_lines jsonb,
  p_user  uuid,
  p_device uuid,
  p_file  text
) returns integer
language plpgsql
set search_path = public, internal
as $$
declare
  r       buy_lines;
  v_item  jsonb;
  v_pos   integer := 0;
  v_cards integer := 0;
  v_sum   numeric := 0;
  v_rows  jsonb := '[]';
  v_file  text := nullif(btrim(coalesce(p_file, '')), '');
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'nothing_to_import';
  end if;
  if exists (select 1 from buy_lines where buy_id = b.id) then
    raise exception 'not_empty';
  end if;
  for v_item in select value from jsonb_array_elements(p_lines) loop
    r := jsonb_populate_record(null::buy_lines, v_item);
    if r.game is distinct from 'mtg' then
      raise exception 'import_magic_only';
    end if;
    if r.quantity is null or r.quantity < 1 or r.unit_price is null or r.unit_price < 0 then
      raise exception 'bad_import_line';
    end if;
    v_pos := v_pos + 1;
    insert into buy_lines (
      buy_id, position, game, lang, name, name_en, name_key, set_code, set_name, source_set_id,
      collector_number, printed_size, rarity, finish, first_edition, treatments, condition,
      quantity, unit_price, market_price, price_source, price_snapshot, priced_at,
      scryfall_id, oracle_id, tcgdex_id, tcgplayer_id, justtcg_card_id, justtcg_variant_id, image_url)
    values (
      b.id, v_pos, 'mtg', 'en', r.name, null, r.name_key, r.set_code, r.set_name, r.source_set_id,
      r.collector_number, r.printed_size, r.rarity, r.finish, false,
      coalesce(r.treatments, '[]'::jsonb), coalesce(r.condition, 'NM'), r.quantity, r.unit_price, r.market_price,
      'import', r.price_snapshot, coalesce(r.priced_at, now()), r.scryfall_id, r.oracle_id, null,
      r.tcgplayer_id, null, null, r.image_url);
    v_cards := v_cards + r.quantity;
    v_sum := v_sum + r.unit_price * r.quantity;
    v_rows := v_rows || jsonb_build_object('sign', '+', 'qty', r.quantity, 'game', 'mtg',
      'unit_price', r.unit_price, 'text', coalesce(v_item ->> 'text', r.quantity || ' ' || r.name));
  end loop;

  update buys set version = version + 1, updated_at = now(), last_edited_by = p_user where id = b.id;

  perform collection_event(b, p_user, p_device, 'collection_imported', array['mtg'], v_cards, 0,
    collection_totals(b, v_sum), v_rows,
    case when v_file is not null
         then jsonb_build_array(jsonb_build_object('field', 'file', 'before', null, 'after', v_file))
         else '[]'::jsonb end,
    sentence(format('%s card%s imported%s', v_cards, case when v_cards = 1 then '' else 's' end,
      case when v_file is not null then ' from ' || v_file else '' end)));
  return v_cards;
end;
$$;

-- ---------------------------------------------------------------------------
-- project_import: + a project, with the file's cards, in one go.
-- ---------------------------------------------------------------------------
create or replace function public.project_import(
  p_name   text,
  p_notes  text,
  p_lines  jsonb,
  p_user   uuid,
  p_device uuid,
  p_file   text
) returns uuid
language plpgsql
set search_path = public, internal
as $$
declare
  v_id uuid;
  b    buys;
begin
  v_id := project_create(p_name, p_notes, p_user, p_device);
  select * into b from buys where id = v_id;
  perform import_lines(b, p_lines, p_user, p_device, p_file);
  return v_id;
end;
$$;
revoke execute on function public.project_import(text, text, jsonb, uuid, uuid, text) from public, anon;
grant execute on function public.project_import(text, text, jsonb, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- collection_import: into an empty collection or project, by the computer
-- editing it. Not Can't upload cards, nor a locked one (Paid/Ours that isn't a
-- project, Completed, Rejected): collection_for_write says so.
-- ---------------------------------------------------------------------------
create or replace function public.collection_import(
  p_buy_id           uuid,
  p_lines            jsonb,
  p_user             uuid,
  p_device           uuid,
  p_expected_version integer,
  p_file             text
) returns integer
language plpgsql
set search_path = public, internal
as $$
declare
  b buys;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, true);
  return import_lines(b, p_lines, p_user, p_device, p_file);
end;
$$;
revoke execute on function public.collection_import(uuid, jsonb, uuid, uuid, integer, text) from public, anon;
grant execute on function public.collection_import(uuid, jsonb, uuid, uuid, integer, text) to authenticated;
