import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase.js';
import { formatPhone } from '../lib/phone.js';
import { MIN_CHARS, customerKey, likeEscape, rankCustomers } from '../lib/customers.js';

const WAIT_MS = 150;

/**
 * A customer name field that suggests past customers as it's typed (owner,
 * 2026-10-09; lib/customers.js): each with the phone number last recorded
 * with it. ↓/↑ move, Enter or a click picks, Esc closes the list (and only
 * the list, not the dialog around it). Picking calls `onPick({ name, phone })`;
 * the page fills in the name and the phone, and both can still be changed.
 * Enter with nothing highlighted goes to the page's own `onKeyDown`.
 * The list floats over everything, so a dialog's scrolling never clips it.
 */
export default function CustomerNameInput({ value, onChange, onPick, onKeyDown, onBlur, ...rest }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [box, setBox] = useState(null);
  const input = useRef(null);
  // Only typing suggests: not a name just picked, nor one filled in when the field opens.
  const typed = useRef(false);
  const run = useRef(0);

  // Look up after a pause in typing; a newer lookup wins.
  useEffect(() => {
    const mine = ++run.current;
    const q = customerKey(value);
    if (!typed.current || q.length < MIN_CHARS) {
      setItems([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('name_key, name, phone, last_used')
        .ilike('name_key', `%${likeEscape(q)}%`)
        .order('last_used', { ascending: false })
        .limit(50);
      if (mine !== run.current) return;
      setItems(error ? [] : rankCustomers(data, q));
      setActive(-1);
    }, WAIT_MS);
    return () => clearTimeout(timer);
  }, [value]);

  const showing = open && items.length > 0;

  // Under the field, kept there if the dialog scrolls or the window resizes.
  useEffect(() => {
    if (!showing) return undefined;
    const place = () => {
      const r = input.current?.getBoundingClientRect();
      if (r) setBox({ left: r.left, top: r.bottom + 4, width: r.width });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [showing]);

  function pick(customer) {
    typed.current = false;
    setOpen(false);
    setItems([]);
    onPick({ name: customer.name, phone: customer.phone });
  }

  return (
    <>
      <input
        {...rest}
        ref={input}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showing}
        value={value}
        onChange={(e) => {
          typed.current = true;
          setOpen(true);
          onChange(e.target.value);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (showing) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (e.key === 'ArrowDown' ? Math.min(i + 1, items.length - 1) : Math.max(i - 1, -1)));
              return;
            }
            if (e.key === 'Enter' && active >= 0) {
              e.preventDefault();
              pick(items[active]);
              return;
            }
            if (e.key === 'Escape') {
              // Close the list, not the dialog: the event stops here.
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {showing && box && createPortal(
        <ul className="name-suggest" role="listbox" aria-label="Past customers" style={box}>
          <li className="name-suggest-head" aria-hidden="true">Past customers</li>
          {items.map((c, i) => (
            <li
              key={c.name_key}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();   // keep the typing in the field
                pick(c);
              }}
            >
              <span className="name-suggest-name">{c.name}</span>
              <span className="name-suggest-phone">{c.phone ? formatPhone(c.phone) : 'no phone'}</span>
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </>
  );
}
