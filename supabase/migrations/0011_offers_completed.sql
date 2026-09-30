-- Offers, final prices and Completed (owner, 2026-09-29). Prices are a deal
-- between two people: marking a collection Priced records the offer made
-- (a cash figure typed in, and the credit offer worked out from it), and
-- marking it Paid/Ours records what was actually paid and whether in cash or
-- credit. After Paid/Ours comes Completed: the cards have moved on (split up,
-- sorted away, put into inventory), so it's locked and search leaves it out.

alter table public.buys
  add column offer_cash   numeric(10,2) check (offer_cash >= 0),
  add column offer_credit numeric(10,2) check (offer_credit >= 0),
  add column paid_price   numeric(10,2) check (paid_price >= 0),
  add column paid_method  text check (paid_method in ('cash', 'credit')),
  add column completed_at timestamptz,
  add constraint buys_paid_price_method check ((paid_price is null) = (paid_method is null));

alter table public.buys drop constraint buys_status_for_kind;
alter table public.buys add constraint buys_status_for_kind check (
     (kind = 'walk_in'    and status in ('draft', 'confirmed'))
  or (kind = 'collection' and status in ('processing', 'priced', 'paid', 'completed')));

-- A status as the app shows it.
create or replace function public.status_label(p text) returns text
language sql immutable
as $$
  select case p when 'processing' then 'Processing' when 'priced' then 'Priced'
                when 'paid' then 'Paid/Ours' when 'completed' then 'Completed' else p end
$$;

-- "$1,234.50" / "$12" for field rows and summaries.
create or replace function public.money_text(p numeric) returns text
language sql immutable
as $$
  select case when p is null then null
              when p = trunc(p) then '$' || to_char(p, 'FM999,999,990')
              else '$' || to_char(p, 'FM999,999,990.00') end
$$;

-- Completed is locked like Paid/Ours: no card, detail or rate changes.
create or replace function public.collection_for_write(
  p_buy_id           uuid,
  p_device           uuid,
  p_expected_version integer,
  p_content          boolean
) returns buys
language plpgsql
set search_path = public
as $$
declare
  b      buys;
  v_lock collection_locks;
begin
  select * into b from buys where id = p_buy_id and kind = 'collection' for update;
  if b.id is null then
    raise exception 'collection_gone';
  end if;
  select * into v_lock from collection_locks where buy_id = p_buy_id;
  if v_lock.buy_id is null or v_lock.device_id is distinct from p_device then
    raise exception 'not_lock_holder';
  end if;
  if p_expected_version is not null and b.version <> p_expected_version then
    raise exception 'stale_version';
  end if;
  if p_content and b.status = 'paid' then
    raise exception 'collection_paid';
  end if;
  if p_content and b.status = 'completed' then
    raise exception 'collection_completed';
  end if;
  update collection_locks set heartbeat_at = now() where buy_id = p_buy_id;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- collection_set_status: now with the deal.
--   → Priced from Processing: needs the offer (p_offer_cash; p_offer_credit,
--     else worked out from the rates). From Paid/Ours or Completed it's an
--     unlock: the offer stays, the paid price goes.
--   → Paid/Ours: needs the final price and cash/credit; snapshots the rates.
--     From Completed it's a reopen: the price paid stays.
--   → Completed: only from Paid/Ours.
--   → Processing: the paid price and snapshot go; the offer is kept (the
--     table shows TBD while Processing, and a new offer replaces it).
-- ---------------------------------------------------------------------------
drop function public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer);

create function public.collection_set_status(
  p_buy_id           uuid,
  p_status           text,
  p_user             uuid,
  p_device           uuid,
  p_cash_pct         numeric,
  p_credit_pct       numeric,
  p_expected_version integer,
  p_offer_cash       numeric default null,
  p_offer_credit     numeric default null,
  p_paid_price       numeric default null,
  p_paid_method      text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  b        buys;
  v_was    text;
  v_cash   numeric;
  v_credit numeric;
  v_market numeric;
  v_rows   jsonb;
  v_totals jsonb := null;
  v_summary text;
begin
  if p_user is null then
    raise exception 'no_user';
  end if;
  if p_status not in ('processing', 'priced', 'paid', 'completed') then
    raise exception 'bad_status';
  end if;
  b := collection_for_write(p_buy_id, p_device, p_expected_version, false);
  v_was := b.status;
  if p_status = v_was then
    return;
  end if;
  v_cash := coalesce(b.custom_cash_pct, p_cash_pct, master_pct('cash_pct'));
  v_credit := coalesce(b.custom_credit_pct, p_credit_pct, master_pct('credit_pct'));
  select coalesce(sum(unit_price * quantity), 0) into v_market from buy_lines where buy_id = p_buy_id;
  v_rows := jsonb_build_array(jsonb_build_object('field', 'status',
    'before', status_label(v_was), 'after', status_label(p_status)));

  if p_status = 'priced' and v_was = 'processing' then
    if p_offer_cash is null or p_offer_cash < 0 then
      raise exception 'offer_needed';
    end if;
    update buys
       set status = 'priced', offer_cash = p_offer_cash,
           offer_credit = coalesce(p_offer_credit,
             case when v_cash > 0 then round_down_price(p_offer_cash * v_credit / v_cash) end),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'offer', 'before', null,
      'after', concat_ws(' / ', money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));
    v_totals := collection_totals(b, v_market);
    v_summary := sentence('Marked Priced: offered ' || concat_ws(' / ',
      money_text(b.offer_cash) || ' cash', money_text(b.offer_credit) || ' credit'));

  elsif p_status = 'paid' and v_was = 'completed' then
    -- Reopened: back to Paid/Ours, still locked, with what was paid.
    update buys
       set status = 'paid', completed_at = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Reopened: back to Paid/Ours, still locked.';

  elsif p_status = 'paid' then
    if p_paid_price is null or p_paid_price < 0 then
      raise exception 'paid_price_needed';
    end if;
    if p_paid_method is null or p_paid_method not in ('cash', 'credit') then
      raise exception 'paid_method_needed';
    end if;
    update buys
       set status = 'paid', paid_at = now(), completed_at = null,
           cash_pct = v_cash, credit_pct = v_credit,
           paid_price = p_paid_price, paid_method = p_paid_method,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_rows := v_rows || jsonb_build_object('field', 'paid', 'before', null,
      'after', money_text(p_paid_price) || ' ' || p_paid_method);
    v_totals := collection_totals(b, v_market);
    v_summary := format('Marked Paid/Ours: paid %s in %s, locked.', money_text(p_paid_price), p_paid_method);

  elsif p_status = 'completed' then
    if v_was <> 'paid' then
      raise exception 'complete_after_paid';
    end if;
    update buys
       set status = 'completed', completed_at = now(),
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := 'Marked Completed: its cards have moved on.';

  else
    -- Back to Priced or Processing: not paid after all. From Processing to
    -- Priced without an offer can't happen (handled above).
    update buys
       set status = p_status, paid_at = null, completed_at = null,
           cash_pct = null, credit_pct = null, paid_price = null, paid_method = null,
           version = version + 1, updated_at = now(), last_edited_by = p_user
     where id = p_buy_id
    returning * into b;
    v_summary := case when v_was in ('paid', 'completed')
                      then sentence('Unlocked: back to ' || status_label(p_status))
                      else sentence('Marked ' || status_label(p_status)) end;
  end if;

  perform collection_event(b, p_user, p_device, 'collection_status_changed', '{}', 0, 0, v_totals, '[]',
    v_rows, v_summary);
end;
$$;

revoke execute on function
  public.money_text(numeric),
  public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, numeric, text)
from public, anon;
grant execute on function
  public.money_text(numeric),
  public.collection_set_status(uuid, text, uuid, uuid, numeric, numeric, integer, numeric, numeric, numeric, text)
to authenticated;
