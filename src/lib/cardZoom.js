/** The magnifying glass's size and its clear rim's width, px (price.css .cz-lens), and how much it enlarges. */
export const LENS = { size: 260, rim: 14, zoom: 2 };

/**
 * Where the magnifying glass goes, and how its copy of the card panel moves
 * inside it so the point under the cursor sits in its middle, `zoom` times
 * the size: `pointer` is the cursor, `panel` the panel's on-screen box
 * (getBoundingClientRect), both in px from the window's top-left.
 * @returns {{ lens: string, view: string }}  CSS transforms for .cz-lens and .cz-lens-view
 */
export function lensTransforms(pointer, panel, { size, rim, zoom } = LENS) {
  const middle = size / 2 - rim;   // the zoom circle's middle, inside the rim
  const x = middle - zoom * (pointer.x - panel.left);
  const y = middle - zoom * (pointer.y - panel.top);
  return {
    lens: `translate(${pointer.x - size / 2}px, ${pointer.y - size / 2}px)`,
    view: `translate(${x}px, ${y}px) scale(${zoom})`,
  };
}
