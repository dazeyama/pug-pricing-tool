import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';
import { DEFAULT_TIERS } from '../lib/rates.js';
import { DEFAULT_BULK_VALUES } from '../lib/bulk.js';
import { dbErrorCode } from '../lib/dbErrors.js';
import { useToast } from '../components/Toast.jsx';
import { PICK_USER_FIRST, useStaff } from './staff.jsx';
import { useDevice } from './device.jsx';
import { settingSummary } from '../lib/settingText.js';

/** A save refused because this screen was out of date (decision 354). */
const STALE_SETTINGS = 'Settings changed on another computer: check and save again';
/**
 * Why nothing is priced yet (decision 389): until Settings has loaded, the built-in defaults
 * would stand in for the store's rates and percentages, so every pricing action waits.
 */
export const SETTINGS_WAIT = "Settings haven't loaded yet: nothing is priced until they do";

// App settings (spec 6.1 `settings`): key/value rows, live on every computer.

export const DEFAULTS = {
  // The store's rates (owner, 2026-10-18: "start prod at 33.34/66.68 default too, hardcode that as
  // default"; decision 333): until Settings has its own.
  cash_pct: 33.34,
  credit_pct: 66.68,
  // Master Fallback Percentages (owner, 2026-09-29): with only a fallback NM
  // price (no JustTCG price), each condition is that price × its percentage.
  fallback_pct_mtg: { NM: 100, LP: 90, MP: 80, HP: 70, DMG: 60 },
  fallback_pct_pokemon: { NM: 100, LP: 85, MP: 70, HP: 55, DMG: 40 },
  // Low-end and high-end rates (docs/TEAM_FEEDBACK.md 4.2): read with rates.js tiersFrom.
  rate_tiers: DEFAULT_TIERS,
  // Bulk values (docs/TEAM_FEEDBACK.md 5.2): read with bulk.js bulkValuesFrom.
  bulk_values: DEFAULT_BULK_VALUES,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const staff = useStaff();
  const { deviceId } = useDevice();
  const { data, loaded, error, reload } = useLiveTable('settings', () =>
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

  // This screen's own last save of each key ({ at, value }, settings_save's answer), until the
  // reload has it; and each key's saves, one after another (decision 394).
  const dataRef = useRef(data);
  dataRef.current = data;
  const written = useRef({});
  const queue = useRef({});

  /** A key's latest value and version: this screen's own save, if the reload doesn't have it yet. */
  const latestOf = (key) => {
    const row = (dataRef.current ?? []).find((r) => r.key === key) ?? null;
    const mine = written.current[key];
    if (mine && (!row || Date.parse(mine.at) >= Date.parse(row.updated_at))) return mine;
    return { at: row?.updated_at ?? null, value: row ? row.value : undefined };
  };

  /**
   * Save one setting, from the version this screen last read (decision 354): a save from an
   * out-of-date screen (another computer saved since, or the first load failed) is refused.
   * One key's saves go one at a time (decision 394): a second box of one object setting saved
   * straight after the first builds on the first's save, not on what the screen showed before it
   * (which wrote the first box's old value back), and isn't refused as out of date.
   * @param {string} key
   * @param {any} next  stored as JSON; or a function of the value now (defaults merged in) giving it
   * @param {string|null} userId  the picked staff user, if any
   * @returns {Promise<string|null>} an error message, or null
   */
  function save(key, next, userId) {
    // A user, and a Changelog entry saying what changed (decision 412).
    if (!userId) {
      staff.pulse();
      return Promise.resolve(PICK_USER_FIRST);
    }
    const run = async () => {
      const latest = latestOf(key);
      const base = DEFAULTS[key];
      const now = base && typeof base === 'object' && latest.value && typeof latest.value === 'object'
        ? { ...base, ...latest.value }
        : latest.value ?? base;
      const value = typeof next === 'function' ? next(now) : next;
      const { data: at, error } = await supabase.rpc('settings_save', {
        p_key: key, p_value: value, p_user: userId, p_expected: latest.at,
        p_device: deviceId ?? null, p_summary: settingSummary(key, now, value),
      });
      if (error) {
        delete written.current[key];
        await reload();
        return dbErrorCode(error) === 'settings_changed' ? STALE_SETTINGS : error.message;
      }
      written.current[key] = { at, value };
      await reload();
      return null;
    };
    const done = (queue.current[key] ?? Promise.resolve()).then(run);
    queue.current[key] = done.catch(() => null);
    return done;
  }

  return (
    <SettingsContext.Provider value={{ loaded, failed: !loaded && Boolean(error), values, save, reload }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}

/** A pricing action's check (decision 389): false, with a toast, while Settings haven't loaded. */
export function useSettingsReady() {
  const { loaded } = useSettings();
  const toast = useToast();
  return useCallback(() => {
    if (loaded) return true;
    toast(`${SETTINGS_WAIT}.`, 'err');
    return false;
  }, [loaded, toast]);
}
