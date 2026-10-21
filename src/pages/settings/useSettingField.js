import { useEffect, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';

/**
 * One Settings box (FABLE_REPORT B11): shows the value saved now, follows
 * other computers' changes unless someone is typing in it, and on blur (or
 * Enter) checks what was typed, saves it and says so; or puts the saved value
 * back and says why. Every message is a toast (owner, 2026-10-16). Spread
 * what it returns onto the box's <input>.
 * @param {object} o
 * @param {number} o.stored  the value saved now
 * @param {(raw: string, next: number) => string|null} o.problem  why what's typed can't be saved, or null
 * @param {(next: number) => Promise<string|null>} o.save  saves it: an error message, or null
 * @param {(next: number) => string} o.saved  the toast once it's saved
 * @param {string} [o.failed]  how the toast starts when saving fails
 * @param {(text: string) => string} [o.clean]  what's typed, tidied (a dollar box drops a leading $)
 * @param {(value: number) => string} [o.shown]  the saved value as the box shows it (a dollar box: "0.40")
 */
export function useSettingField({
  stored, problem, save, saved, failed = "Couldn't save", clean = (t) => t.trim(), shown = String,
}) {
  const toast = useToast();
  const [text, setText] = useState(shown(stored));
  const [editing, setEditing] = useState(false);
  // What the box held when it got focus: left as it was, nothing is saved, so a box only clicked
  // into never writes its old value over another computer's change (decision 354).
  const [atFocus, setAtFocus] = useState(null);

  // Follow other computers' changes, but never under someone's typing.
  const display = shown(stored);
  useEffect(() => {
    if (!editing) setText(display);
  }, [display, editing]);

  async function commit() {
    setEditing(false);
    if (atFocus !== null && clean(text) === clean(atFocus)) {
      setText(shown(stored));
      return;
    }
    const raw = clean(text);
    const next = Number(raw);
    const why = problem(raw, next);
    if (why) {
      toast(why, 'err');
      setText(shown(stored));
      return;
    }
    if (next === stored) return;
    const err = await save(next);
    if (err) {
      toast(`${failed}: ${err}`, 'err');
      setText(shown(stored));
    } else {
      toast(saved(next), 'ok');
    }
  }

  return {
    value: text,
    onFocus: () => {
      setEditing(true);
      setAtFocus(text);
    },
    onChange: (e) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    },
  };
}
