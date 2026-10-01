import { createContext, useContext, useMemo } from 'react';
import { supabase } from '../lib/supabase.js';
import { useLiveTable } from '../lib/useLiveTable.js';

// Master Crystal Inventory files (spec 11.1): the current Crystal Commerce CSV
// and the copy before it (owner, 2026-09-30: the files are 40 MB+, so no more
// than that are kept). Drives the "required" banner on every tab.

/**
 * @typedef {{ id: string, storage_path: string, original_filename: string,
 *   size_bytes: number, row_count: number, columns: string[],
 *   uploaded_at: string, uploaded_by: string|null, is_current: boolean }} InventoryFile
 */

const InventoryContext = createContext(null);

export function InventoryProvider({ children }) {
  const { data, loaded, reload } = useLiveTable('master_inventory_files', () =>
    supabase.from('master_inventory_files').select('*').order('uploaded_at', { ascending: false }));

  const value = useMemo(() => {
    /** @type {InventoryFile[]} */
    const files = data ?? [];
    return {
      loaded,
      reload,
      current: files.find((f) => f.is_current) ?? null,
      previous: files.filter((f) => !f.is_current).slice(0, 1),
    };
  }, [data, loaded, reload]);

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  return useContext(InventoryContext);
}
