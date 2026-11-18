-- 0017: TCGplayer's Magic catalog, kept in the app (decision 588, phase 1).
--
-- Crystal Commerce matching through TCGplayer ids needs TCGplayer's own name and set for a line's TCGplayer id
-- (`buy_lines.tcgplayer_id`, Scryfall's). tcgcsv.com mirrors TCGplayer's catalog daily but sends no CORS header,
-- so the `tcgcatalog` Edge Function fetches it server-side and writes it here: the groups (sets) and their
-- products, only a group's id, name, set and number, all matching needs. Nothing reads them yet: phase 3 does.
-- Written only by the function (service role), through tcg_group_load and tcg_catalog_finish; the signed-in role
-- reads both tables. Not backed up: tcgcsv is the source, as the inventory file is CC's.

-- The groups, as tcgcsv lists them. modified_on is the source's, compared to fetch only the groups changed since.
create table public.tcg_groups (
  group_id        integer primary key,
  name            text not null,
  abbreviation    text,
  is_supplemental boolean,
  published_on    timestamp,
  modified_on     timestamp,
  products        integer not null default 0,
  fetched_at      timestamptz not null default now(),   -- when its products were last fetched
  checked_at      timestamptz not null default now()    -- when a full pass last found it in tcgcsv's list
);

-- Their products: the TCGplayer product id (a line's tcgplayer_id), its group, its name and its collector number
-- (extendedData's Number; none for sealed product and tokens without one).
create table public.tcg_products (
  product_id integer primary key,
  group_id   integer not null references public.tcg_groups (group_id) on delete cascade,
  name       text not null,
  number     text
);
create index tcg_products_group on public.tcg_products (group_id);

alter table public.tcg_groups enable row level security;
alter table public.tcg_products enable row level security;
create policy "store: read" on public.tcg_groups as permissive for select to authenticated using (true);
create policy "store: read" on public.tcg_products as permissive for select to authenticated using (true);
revoke all on table public.tcg_groups from public, anon, authenticated, service_role;
revoke all on table public.tcg_products from public, anon, authenticated, service_role;
grant select on table public.tcg_groups to authenticated;
grant select on table public.tcg_products to authenticated;
grant all on table public.tcg_groups to service_role;
grant all on table public.tcg_products to service_role;

-- One group, its products replaced whole in one call, so a group is never half-loaded.
-- p_group: {groupId, name, abbreviation, isSupplemental, publishedOn, modifiedOn}, as tcgcsv sends it.
-- p_products: [{product_id, name, number}]. Returns the group's product count.
create function public.tcg_group_load(p_group jsonb, p_products jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  g integer := (p_group ->> 'groupId')::integer;
  n integer;
begin
  if g is null or nullif(btrim(p_group ->> 'name'), '') is null then raise exception 'bad_group'; end if;
  if jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products) > 20000 then
    raise exception 'bad_batch';
  end if;
  insert into tcg_groups (group_id, name, abbreviation, is_supplemental, published_on, modified_on, fetched_at, checked_at)
  values (g, p_group ->> 'name', nullif(p_group ->> 'abbreviation', ''), (p_group ->> 'isSupplemental')::boolean,
          (p_group ->> 'publishedOn')::timestamp, (p_group ->> 'modifiedOn')::timestamp, now(), now())
  on conflict (group_id) do update set
    name = excluded.name, abbreviation = excluded.abbreviation, is_supplemental = excluded.is_supplemental,
    published_on = excluded.published_on, modified_on = excluded.modified_on,
    fetched_at = excluded.fetched_at, checked_at = excluded.checked_at;
  delete from tcg_products where group_id = g;
  -- A product TCGplayer moved here from another group is taken over (its id is its key).
  insert into tcg_products (product_id, group_id, name, number)
  select distinct on (r.product_id) r.product_id, g, r.name, nullif(btrim(r.number), '')
    from jsonb_to_recordset(p_products) as r(product_id integer, name text, number text)
   where r.product_id is not null and r.name is not null
   order by r.product_id
  on conflict (product_id) do update set group_id = excluded.group_id, name = excluded.name, number = excluded.number;
  select count(*) into n from tcg_products where group_id = g;
  update tcg_groups set products = n where group_id = g;
  return n;
end;
$$;
revoke all on function public.tcg_group_load(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.tcg_group_load(jsonb, jsonb) to service_role;

-- A full pass is done: every group still in tcgcsv's list is marked checked now, and a group gone from it goes,
-- its products with it. p_group_ids: every group id in the list.
create function public.tcg_catalog_finish(p_group_ids integer[])
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_group_ids is null or cardinality(p_group_ids) = 0 then raise exception 'bad_batch'; end if;
  delete from tcg_groups where group_id <> all (p_group_ids);
  update tcg_groups set checked_at = now() where true;
  -- A product that moved to another group keeps its newest group's count right.
  update tcg_groups t set products = c.n
    from (select g.group_id, count(p.product_id)::integer as n
            from tcg_groups g left join tcg_products p on p.group_id = g.group_id
           group by g.group_id) c
   where c.group_id = t.group_id and t.products is distinct from c.n;
  return jsonb_build_object('checked_at', now(), 'groups', (select count(*) from tcg_groups),
                            'products', (select count(*) from tcg_products));
end;
$$;
revoke all on function public.tcg_catalog_finish(integer[]) from public, anon, authenticated;
grant execute on function public.tcg_catalog_finish(integer[]) to service_role;
