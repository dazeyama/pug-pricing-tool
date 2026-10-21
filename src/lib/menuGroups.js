// The groups of a ⋯ or EXPORT menu (decision 422): an item with `items` is a
// group, "Print ▸", drawn as a flyout by components/MenuItems.jsx. Pure, so
// the tests run under Node.

/**
 * The items as the menu shows them: a group of one is shown as that item, on
 * the root (owner, 2026-10-21: nothing hides behind an arrow alone); a group
 * with none, or with only false/null entries, is left out.
 * @param {object[]} items  leaves, and groups `{ label, items }`
 * @returns {object[]}
 */
export function flattenGroups(items) {
  return (items ?? []).flatMap((item) => {
    if (!item) return [];
    if (!item.items) return [item];
    const inside = item.items.filter(Boolean);
    if (!inside.length) return [];
    return inside.length === 1 ? [inside[0]] : [{ ...item, items: inside }];
  });
}
