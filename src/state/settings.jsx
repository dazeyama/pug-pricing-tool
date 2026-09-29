import { createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';

// App settings (spec 6.1 `settings`): key/value rows, live on every computer.

export const DEFAULTS = {
  cash_pct: 33,
  credit_pct: 66,
  // Master Fallback Percentages (owner, 2026-09-29): with only a fallback NM
  // price (no JustTCG price), each condition is that price × its percentage.
  fallback_pct_mtg: { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 },
  fallback_pct_pokemon: { NM: 100, LP: 85, MP: 70, HP: 55, DMG: 40 },
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { data, loaded, reload } = useLiveTable('settings', () =>
    supabase.from('settings').select('key, value, updated_at, updated_by'));

  const values = useMemo(() => {
    const out = { ...DEFAULTS };
    for (const row of data ?? []) {
      // Objects merge over the defaults, so a partial saved value still has every key.
      const base = DEFAULTS[row.key];
      out[row.key] = base && typeof base === 'object' && row.value && typeof row.value === 'object'
        ? { ...base, ...row.value }
        : row.value;
    }
    return out;
  }, [data]);

  /**
   * @param {string} key
   * @param {any} value  stored as JSON
   * @param {string|null} userId  the picked staff user, if any
   * @returns {Promise<string|null>} an error message, or null
   */
  async function save(key, value, userId) {
    const { error } = await supabase.from('settings').upsert({
      key, value, updated_at: new Date().toISOString(), updated_by: userId ?? null,
    });
    if (error) return error.message;
    await reload();
    return null;
  }

  return (
    <SettingsContext.Provider value={{ loaded, values, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
