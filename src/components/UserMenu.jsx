import { useEffect, useRef, useState } from 'react';
import { useStaff } from '../state/staff.jsx';
import { useToast } from './Toast.jsx';
import { PALETTE, colorVar, textOn } from '../lib/palette.js';
import Modal from './Modal.jsx';

// The staff-user button and menu (spec 7.3), left of the header search.
// Pick a user, add one (colour auto-assigned), or use ⋯ to change a user's
// colour or delete them (hidden, kept for history).
export default function UserMenu() {
  const staff = useStaff();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [pulsing, setPulsing] = useState(false);
  const wrap = useRef(null);

  function close() {
    setOpen(false);
    setAdding(false);
    setNewName('');
    setAddError('');
    setEditingId(null);
  }

  // Click outside or Esc closes the menu.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!wrap.current?.contains(e.target)) close();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Something needed a user and none is picked: pulse the button.
  useEffect(() => {
    if (!staff.pulseKey) return undefined;
    setPulsing(false);
    const frame = requestAnimationFrame(() => setPulsing(true));
    const timer = setTimeout(() => setPulsing(false), 1000);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [staff.pulseKey]);

  async function submitAdd(e) {
    e.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy(true);
    setAddError('');
    const error = await staff.add(newName);
    setBusy(false);
    if (error) {
      setAddError(error);
    } else {
      toast(`Added ${newName.trim()}.`, 'ok');
      close();
    }
  }

  async function changeColor(user, color) {
    if (color === user.color) return;
    const error = await staff.setColor(user.id, color);
    if (error) toast(`Couldn't change the color: ${error}`, 'err');
  }

  async function confirmDelete() {
    const user = toDelete;
    setToDelete(null);
    const error = await staff.remove(user.id);
    toast(error ? `Couldn't delete ${user.name}: ${error}` : `Deleted ${user.name}.`, error ? 'err' : 'ok');
  }

  const { current, active } = staff;

  /** Sign out: back to no user picked, so actions ask for one again (owner, 2026-09-29). */
  function signOut() {
    const name = current?.name;
    close();
    staff.select(null);
    if (name) toast(`${name} signed out. Pick a user to carry on.`, 'ok');
  }

  return (
    <div className="user-area">
    <div className="user-menu" ref={wrap}>
      <button
        type="button"
        className={`user-btn${current ? ' filled' : ''}${pulsing ? ' pulse' : ''}${open ? ' open' : ''}`}
        style={current ? { '--c': colorVar(current.color), '--c-text': textOn(current.color) } : undefined}
        title={current ? `Working as ${current.name}` : 'Pick who is working at this computer'}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {current ? (
          <span className="user-name">{current.name}</span>
        ) : (
          <span className="user-name none">Pick user</span>
        )}
        <span className="caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="user-pop" role="menu">
          {active.length === 0 && (
            <p className="user-empty">No users yet. Add the first one below.</p>
          )}
          {active.map((u) => (
            <div key={u.id} className="user-item">
              <div className={`user-row${u.id === current?.id ? ' current' : ''}`}>
                <button
                  type="button"
                  className="user-pick"
                  role="menuitemradio"
                  aria-checked={u.id === current?.id}
                  onClick={() => {
                    staff.select(u.id);
                    close();
                  }}
                >
                  <span className="user-dot" style={{ '--c': colorVar(u.color) }} />
                  <span className="user-row-name">{u.name}</span>
                  {u.id === current?.id && <span className="user-check" aria-hidden="true">✓</span>}
                </button>
                <button
                  type="button"
                  className={`icon-btn user-more${editingId === u.id ? ' on' : ''}`}
                  title={`Change color or delete ${u.name}`}
                  aria-label={`Options for ${u.name}`}
                  onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                >
                  ⋯
                </button>
              </div>
              {editingId === u.id && (
                <div className="user-edit">
                  <div className="swatches" role="radiogroup" aria-label={`Color for ${u.name}`}>
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`swatch${c === u.color ? ' active' : ''}`}
                        style={{ '--s': colorVar(c) }}
                        title={c.replace('pal-', '')}
                        aria-label={c.replace('pal-', '')}
                        aria-checked={c === u.color}
                        role="radio"
                        onClick={() => changeColor(u, c)}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn small danger-ghost"
                    onClick={() => {
                      close();
                      setToDelete(u);
                    }}
                  >
                    Delete…
                  </button>
                </div>
              )}
            </div>
          ))}

          <div className="user-add">
            {adding ? (
              <form onSubmit={submitAdd}>
                <div className="user-add-row">
                  <input
                    type="text"
                    autoFocus
                    maxLength={40}
                    placeholder="Name"
                    aria-label="New user's name"
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      setAddError('');
                    }}
                  />
                  <button
                    type="submit"
                    className={`btn small primary${busy ? ' busy' : ''}`}
                    disabled={!newName.trim()}
                  >
                    Add
                  </button>
                </div>
                {addError && <p className="user-error">{addError}</p>}
              </form>
            ) : (
              <button type="button" className="user-add-btn" onClick={() => setAdding(true)}>
                + Add user…
              </button>
            )}
          </div>
        </div>
      )}

      {toDelete && (
        <Modal
          title="Delete user"
          onClose={() => setToDelete(null)}
          footer={
            <>
              <button type="button" className="btn ghost" autoFocus onClick={() => setToDelete(null)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={confirmDelete}>
                Delete
              </button>
            </>
          }
        >
          <p>
            Delete <strong>{toDelete.name}</strong>? Past buys will still show their name.
          </p>
        </Modal>
      )}
    </div>
    {current && (
      <button
        type="button"
        className="user-signout"
        title={`Sign out ${current.name} (no user picked until someone picks one)`}
        aria-label={`Sign out ${current.name}`}
        onClick={signOut}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    )}
    </div>
  );
}
