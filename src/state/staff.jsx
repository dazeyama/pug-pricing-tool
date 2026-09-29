import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { readLocal, writeLocal } from '../lib/local.js';
import { nextColor } from '../lib/palette.js';
import { useLiveTable } from '../lib/useLiveTable.js';

// Staff users (spec 7.3): colour-coded profiles picked from the header, not
// logins. The picked user is remembered on this computer until changed, and
// is who the app records for every change.

/**
 * @typedef {{ id: string, name: string, color: string, active: boolean, created_at: string }} StaffUser
 */

const CURRENT_KEY = 'pug.staffUserId';

/** Tooltip on anything that needs a user picked first. */
export const PICK_USER_FIRST = 'Pick a user first';

const StaffContext = createContext(null);

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

export function StaffProvider({ children }) {
  const { data, loaded, reload } = useLiveTable('staff_users', () =>
    supabase.from('staff_users').select('*').order('created_at'));
  const [currentId, setCurrentId] = useState(() => readLocal(CURRENT_KEY));
  const [pulseKey, setPulseKey] = useState(0);

  /** @type {StaffUser[]} every user, deleted ones included, for history */
  const all = useMemo(() => data ?? [], [data]);
  /** @type {StaffUser[]} the dropdown: active users by name */
  const active = useMemo(() => all.filter((u) => u.active).sort(byName), [all]);
  // A user deleted on another computer stops being picked here too.
  const current = active.find((u) => u.id === currentId) ?? null;

  const select = useCallback((id) => {
    setCurrentId(id);
    writeLocal(CURRENT_KEY, id);
  }, []);

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
    loaded, all, active, current, byId, select, add, setColor, remove, pulse, pulseKey,
  };
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  return useContext(StaffContext);
}
