import { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * The blue EXPORT button (spec 14): a placeholder until the export has its
 * own design. Clicking it says so. On a collection's screen and the day pages.
 * `intercept` runs first (a day page's "mark Completed?" warning, owner
 * 2026-09-30): the placeholder opens only if it returns true.
 */
export default function ExportButton({ className = '', onDone, intercept, blocked = null }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onDone?.();
  };
  return (
    <>
      {/* `blocked`: why it can't run now (today on a day page); it looks disabled, and `intercept` says why. */}
      <button
        type="button"
        className={`btn export-btn ${className}${blocked ? ' is-disabled' : ''}`}
        aria-disabled={blocked ? true : undefined}
        title={blocked ?? undefined}
        onClick={() => (!intercept || intercept()) && !blocked && setOpen(true)}
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
