-- Export Phase E2 (docs/EXPORT_FUNCTION.md 6.2, 6.3, 7): what staff taught
-- the matcher (set → category choices, remembered products), and the reads
-- the matcher needs from the current inventory's products.

-- Staff's set → CC Category choices (the review's "Always use … for …").
create table public.cc_set_map (
  scryfall_set  text not null,                       -- Scryfall set code, lower case
  promo_kind    text not null default '' check (promo_kind in ('', 'prerelease', 'promopack')),
  category      text not null,
  source        text not null default 'staff' check (source in ('staff', 'rule')),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.staff_users (id) on delete set null,
  primary key (scryfall_set, promo_kind)
);

-- Remembered matches: this printing in this finish is this CC product.
create table public.cc_product_links (
  scryfall_id   text not null,
  finish        text not null check (finish in ('nonfoil', 'foil', 'etched')),
  product_id    text not null,
  product_name  text not null,                       -- as linked (shown if the product is gone)
  category      text not null,
  source        text not null check (source in ('staff', 'auto')),
  linked_at     timestamptz not null default now(),
  linked_by     uuid references public.staff_users (id) on delete set null,
  primary key (scryfall_id, finish)
);

alter table public.cc_set_map enable row level security;
alter table public.cc_product_links enable row level security;
revoke all on public.cc_set_map, public.cc_product_links from anon;
grant select, insert, update, delete on public.cc_set_map, public.cc_product_links to authenticated;
create policy "store: full access" on public.cc_set_map for all to authenticated using (true) with check (true);
create policy "store: full access" on public.cc_product_links for all to authenticated using (true) with check (true);

-- The current inventory's file, for the reads below.
create or replace function public.cc_current_file() returns uuid
language sql stable
set search_path = public
as $$
  select id from master_inventory_files where is_current limit 1
$$;

-- Every category in the current inventory.
create or replace function public.cc_categories() returns text[]
language sql stable
set search_path = public
as $$
  select coalesce(array_agg(distinct category order by category), '{}')
    from cc_products where file_id = cc_current_file()
$$;

-- Candidates for a whole export in one call (export spec 7.4 step 1): for each
-- want { key, category, base_keys }, the current inventory's products with one
-- of those base keys, in that category (or in any category when it's null).
create or replace function public.cc_candidates(p_wants jsonb)
returns table (
  key text, product_id text, cc_id text, product_name text, category text, base_key text,
  bracket text, foil_kind text, variants text[]
)
language sql stable
set search_path = public
as $$
  select w.key, p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from jsonb_to_recordset(p_wants) as w(key text, category text, base_keys text[])
    join cc_products p
      on p.file_id = cc_current_file()
     and p.base_key = any(w.base_keys)
     and (w.category is null or p.category = w.category)
   order by w.key, p.category, p.product_name
$$;

-- Products by Product ID in the current inventory (remembered links still there?).
create or replace function public.cc_products_by_id(p_ids text[])
returns table (
  product_id text, cc_id text, product_name text, category text, base_key text,
  bracket text, foil_kind text, variants text[]
)
language sql stable
set search_path = public
as $$
  select product_id, cc_id, product_name, category, base_key, bracket, foil_kind, variants
    from cc_products
   where file_id = cc_current_file() and product_id = any(p_ids)
$$;

-- "Find another CC product…" in the review: names containing the text.
create or replace function public.cc_products_search(p_text text, p_limit integer default 30)
returns table (
  product_id text, cc_id text, product_name text, category text, base_key text,
  bracket text, foil_kind text, variants text[]
)
language sql stable
set search_path = public
as $$
  with q as (
    select '%' || replace(replace(replace(lower(btrim(coalesce(p_text, ''))), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select p.product_id, p.cc_id, p.product_name, p.category, p.base_key, p.bracket, p.foil_kind, p.variants
    from cc_products p, q
   where p.file_id = cc_current_file()
     and length(btrim(coalesce(p_text, ''))) >= 2
     and (p.base_key like q.pat or lower(p.product_name) like q.pat)
   order by length(p.product_name), p.product_name
   limit least(greatest(coalesce(p_limit, 30), 1), 100)
$$;

revoke execute on function
  public.cc_current_file(), public.cc_categories(), public.cc_candidates(jsonb),
  public.cc_products_by_id(text[]), public.cc_products_search(text, integer)
from public, anon;
grant execute on function
  public.cc_current_file(), public.cc_categories(), public.cc_candidates(jsonb),
  public.cc_products_by_id(text[]), public.cc_products_search(text, integer)
to authenticated;
