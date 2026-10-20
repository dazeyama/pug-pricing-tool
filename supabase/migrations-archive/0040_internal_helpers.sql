-- Fixes from the pre-launch smoke test (BUGS.md 3, 7, 11, 12; 2026-10-02).

-- ---------------------------------------------------------------------------
-- 3. Helpers only the database's own functions should call move to a schema
-- the API doesn't serve (PostgREST serves `public` only), so the app can't
-- call them directly and skip the checks around them (export_stamp writes
-- export stamps, cant_upload_return moves cards, buy_event writes the
-- changelog…). The public functions run as the caller, so signed-in users
-- keep EXECUTE on them and USAGE on the schema; they just can't reach them
-- through the API any more.
-- ---------------------------------------------------------------------------
create schema if not exists internal;
revoke all on schema internal from public;
grant usage on schema internal to authenticated, service_role;

alter function public.buy_event(buys, uuid, uuid, text, text, text[], integer, numeric, jsonb, text) set schema internal;
alter function public.collection_event(buys, uuid, uuid, text, text[], integer, integer, jsonb, jsonb, jsonb, text) set schema internal;
alter function public.collection_for_write(uuid, uuid, integer, boolean) set schema internal;
alter function public.cant_upload_copy(uuid[], jsonb, text, uuid, uuid) set schema internal;
alter function public.cant_upload_return(uuid[], text, uuid, uuid) set schema internal;
alter function public.export_stamp(jsonb, uuid, text) set schema internal;
alter function public.export_learn(jsonb, jsonb, uuid, uuid) set schema internal;
alter function public.export_check(uuid[], jsonb, uuid[], uuid) set schema internal;
alter function public.export_line_text(buy_lines, integer) set schema internal;
alter function public.collection_totals(buys, numeric) set schema internal;
alter function public.buy_target_name(uuid) set schema internal;
alter function public.cc_custom_sku(timestamptz) set schema internal;
alter function public.norm_number(text) set schema internal;

-- Every function of ours finds them by name: search_path public, internal
-- (security-definer ones keep pg_temp last). This also gives the small
-- helpers that had none a fixed search_path (11). Extensions' functions are
-- left alone. Any function written later that calls an internal helper must
-- `set search_path = public, internal` too (CLAUDE.md).
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prosecdef
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'internal')
       and p.prokind = 'f'
       and p.proowner = (select oid from pg_roles where rolname = current_user)
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = %s', f.sig,
                   case when f.prosecdef then 'public, internal, pg_temp' else 'public, internal' end);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 7. buys_in_range (recreated in 0038) is for signed-in users only, like
-- every other function.
-- ---------------------------------------------------------------------------
revoke execute on function public.buys_in_range(timestamptz, timestamptz) from public, anon;
grant execute on function public.buys_in_range(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. day_mark was kept for the v0.9.1 live build (0027); the live site runs
-- 0.9.9-day0 now and nothing calls it.
-- ---------------------------------------------------------------------------
drop function public.day_mark(date, text, uuid, uuid, boolean);
