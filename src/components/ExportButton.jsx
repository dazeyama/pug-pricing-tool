import { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * The blue EXPORT button: on the day pages and a collection's screen. With
 * `onClick` it runs the page's export (docs/EXPORT_FUNCTION.md 8); without,
 * it's still the placeholder that says the export is coming.
 */
export default function ExportButton({ className = '', onDone, onClick, blocked = null }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onDone?.();
  };
  return (
    <>
      {/* `blocked`: why it can't run now (today on a day page); it looks disabled, and `onClick` says why. */}
      <button
        type="button"
        className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
        aria-disabled={blocked ? true : undefined}
        title={blocked ?? undefined}
        onClick={() => (onClick ? onClick() : !blocked && setOpen(true))}
      >
        EXPORT
      </button>
      {open && (
        <Modal
          title="Export"
          onClose={close}
          footer={<button type="button" className="btn primary" autoFocus onClick={close}>OK</button>}
        >
          <p className="coming-soon">EXPORT COMING SOON</p>
        </Modal>
      )}
    </>
  );
}
