// Who's on the app right now (decision 284), from a Supabase Realtime
// Presence state: each key is a computer (its device id), each entry under it
// a tab of that computer with the user picked there. Pure, for tests.

/**
 * @param {Record<string, { label?: string, user_id?: string|null, user_name?: string|null, user_color?: string|null }[]>} state
 *   channel.presenceState()
 * @returns {{ computers: { id: string, label: string }[],
 *   users: { id: string, name: string, color: string|null, computers: string[] }[] }}
 *   computers A to Z by name; users A to Z by name, each with the computers they're picked on
 */
export function whoIsOn(state) {
  const computers = [];
  const users = new Map();
  for (const [id, metas] of Object.entries(state ?? {})) {
    const tabs = Array.isArray(metas) ? metas : [];
    const label = tabs.find((m) => m?.label)?.label ?? 'A computer';
    computers.push({ id, label });
    for (const m of tabs) {
      if (!m?.user_id) continue;
      const u = users.get(m.user_id)
        ?? { id: m.user_id, name: m.user_name ?? 'Someone', color: m.user_color ?? null, computers: [] };
      if (!u.computers.includes(label)) u.computers.push(label);
      users.set(m.user_id, u);
    }
  }
  const byName = (key) => (a, b) => a[key].localeCompare(b[key], 'en', { sensitivity: 'base' });
  return {
    computers: computers.sort(byName('label')),
    users: [...users.values()].sort(byName('name')),
  };
}
