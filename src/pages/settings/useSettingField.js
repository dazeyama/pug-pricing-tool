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
 */
export function useSettingField({ stored, problem, save, saved, failed = "Couldn't save", clean = (t) => t.trim() }) {
  const toast = useToast();
  const [text, setText] = useState(String(stored));
  const [editing, setEditing] = useState(false);

  // Follow other computers' changes, but never under someone's typing.
  useEffect(() => {
    if (!editing) setText(String(stored));
  }, [stored, editing]);

  async function commit() {
    setEditing(false);
    const raw = clean(text);
    const next = Number(raw);
    const why = problem(raw, next);
    if (why) {
      toast(why, 'err');
      setText(String(stored));
      return;
    }
    if (next === stored) return;
    const err = await save(next);
    if (err) {
      toast(`${failed}: ${err}`, 'err');
      setText(String(stored));
    } else {
      toast(saved(next), 'ok');
    }
  }

  return {
    value: text,
    onFocus: () => setEditing(true),
    onChange: (e) => setText(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Enter') e.currentTarget.blur();
    },
  };
}
