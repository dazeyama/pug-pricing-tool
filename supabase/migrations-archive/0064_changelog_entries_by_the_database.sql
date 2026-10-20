-- Two Changelog entries the app wrote into `events` itself (FABLE_REPORT A2):
-- a collection's 📞 Called, and a month's cash buys downloaded. Now the
-- database writes them, as it writes every other entry: who it was (name and
-- colour from staff_users, not what the browser sends), the kind, the action
-- and the target fixed here. The app still words the summary (its money
-- format).
--
-- Step 1 of 2. The browser can still insert into `events` directly: the site
-- live now does, for these two, until the new app is pushed. Step 2 takes
-- that away; it has to make internal.buy_event and internal.collection_event
-- run with the owner's rights first, since they insert as the caller and rely
-- on the same permission.

-- 📞 Called (owner, 2026-10-02): one entry per click, all that's kept of a call.
create function public.collection_log_call(p_buy_id uuid, p_user uuid, p_device uuid, p_summary text)
returns void
language plpgsql
set search_path = public, internal
as $$
declare
  b buys;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into b from buys where id = p_buy_id and kind = 'collection';
  if b.id is null then raise exception 'collection_gone'; end if;
  perform internal.collection_event(b, p_user, p_device, 'collection_called', '{}', 0, 0, null, '[]', '[]', p_summary);
end;
$$;

-- Cash buys downloaded (owner, 2026-10-02): the month's entry, which also marks
-- the month downloaded on the Calendar. `day` is the month's first day.
create function public.buy_log_cash_download(p_month date, p_user uuid, p_device uuid, p_summary text)
returns void
language plpgsql
set search_path = public, internal
as $$
declare
  v_user staff_users;
  v_month date := date_trunc('month', p_month)::date;
begin
  if p_user is null then raise exception 'no_user'; end if;
  select * into v_user from staff_users where id = p_user;
  insert into events (staff_user_id, staff_user_name, staff_user_color, device_id, kind, action,
                      target_name, day, summary)
  values (p_user, v_user.name, v_user.color, p_device, 'buy', 'cash_buys_downloaded',
          'Cash buys · ' || to_char(v_month, 'FMMonth YYYY'), v_month, coalesce(p_summary, ''));
end;
$$;

revoke execute on function public.collection_log_call(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.collection_log_call(uuid, uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.buy_log_cash_download(date, uuid, uuid, text) from public, anon;
grant execute on function public.buy_log_cash_download(date, uuid, uuid, text) to authenticated, service_role;
