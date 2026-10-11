import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readSession, writeLocal, writeSession } from '../lib/local.js';
import { useToast } from '../components/Toast.jsx';
import { nextColor } from '../lib/palette.js';
import { useLiveTable } from '../lib/useLiveTable.js';

// Staff users (spec 7.3): colour-coded profiles picked from the header, not
// logins. The picked user is who the app records for every change. It's kept
// for this tab only (owner, 2026-10-11: too easy to work as someone else): a
// new tab starts with no one picked, a reload keeps them, and they're
// forgotten after each confirmed buy and when the tab goes unused for
// IDLE_MINUTES, so whoever is at the counter picks themselves. No passwords.

/**
 * @typedef {{ id: string, name: string, color: string, active: boolean, created_at: string }} StaffUser
 */

const CURRENT_KEY = 'pug.staffUserId';
/** No mouse, keyboard or touch in this tab for this long, and the picked user is forgotten. */
export const IDLE_MINUTES = 10;
const IDLE_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

/** Tooltip on anything that needs a user picked first. */
export const PICK_USER_FIRST = 'Pick a user first';

const StaffContext = createContext(null);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function StaffProvider({ children }) {
  const { data, loaded, reload } = useLiveTable('staff_users', () =>
    supabase.from('staff_users').select('*').order('created_at'));
  const toast = useToast();
  const [currentId, setCurrentId] = useState(() => readSession(CURRENT_KEY));
  const [pulseKey, setPulseKey] = useState(0);
  // Before 2026-10-11 the pick was kept for the whole computer: that copy goes.
  useEffect(() => writeLocal(CURRENT_KEY, null), []);

  /** @type {StaffUser[]} every user, deleted ones included, for history */
  const all = useMemo(() => data ?? [], [data]);
  /** @type {StaffUser[]} the dropdown: active users by name */
  const active = useMemo(() => all.filter((u) => u.active).sort(byName), [all]);
  // A user deleted on another computer stops being picked here too.
  const current = active.find((u) => u.id === currentId) ?? null;

  const select = useCallback((id) => {
    setCurrentId(id);
    writeSession(CURRENT_KEY, id);
  }, []);

  /** Un-pick the user (after a confirmed buy, or an unused tab), saying why when there's a message. */
  const forget = useCallback((message) => {
    select(null);
    if (message) toast(message, 'warn');
  }, [select, toast]);

  // An unused tab forgets its user (owner, 2026-10-11). Checked every 30
  // seconds and whenever the tab comes back into view, from the last time
  // anyone touched it, so a background tab's slowed timers can't miss it.
  const picked = Boolean(currentId);
  useEffect(() => {
    if (!picked) return undefined;
    let last = Date.now();
    const seen = () => {
      last = Date.now();
    };
    const check = () => {
      if (Date.now() - last >= IDLE_MINUTES * 60_000) {
        forget(`No one used this tab for ${IDLE_MINUTES} minutes: pick your user again.`);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    for (const e of IDLE_EVENTS) window.addEventListener(e, seen, { capture: true, passive: true });
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 30_000);
    return () => {
      for (const e of IDLE_EVENTS) window.removeEventListener(e, seen, { capture: true });
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [picked, forget]);

  /** Look up any user, deleted or not, e.g. an uploader. */
  const byId = useCallback((id) => all.find((u) => u.id === id) ?? null, [all]);

  /** @returns {Promise<string|null>} an error message, or null */
  async function add(name) {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return 'Type a name.';
    const { data: row, error } = await supabase
      .from('staff_users')
      .insert({ name: clean, color: nextColor(active) })
      .select()
      .single();
    if (error) {
      return error.code === '23505' ? `${clean} is already on the list.` : error.message;
    }
    select(row.id);
    await reload();
    return null;
  }

  /** @returns {Promise<string|null>} */
  async function setColor(id, color) {
    const { error } = await supabase.from('staff_users').update({ color }).eq('id', id);
    if (error) return error.message;
    await reload();
    return null;
  }

  /** "Delete" hides the user; past records keep their name. */
  async function remove(id) {
    const { error } = await supabase.from('staff_users').update({ active: false }).eq('id', id);
    if (error) return error.message;
    if (id === currentId) select(null);
    await reload();
    return null;
  }

  /** Flash the user button: something needed a user and none is picked. */
  const pulse = useCallback(() => setPulseKey((n) => n + 1), []);

  const value = {
    loaded, all, active, current, byId, select, forget, add, setColor, remove, pulse, pulseKey,
  };
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  return useContext(StaffContext);
}
