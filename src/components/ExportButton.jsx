import { useState } from 'react';
import Modal from './Modal.jsx';

/**
 * The blue EXPORT button (spec 14): a placeholder until the export has its
 * own design. Clicking it says so. On a collection's screen now; on the day
 * pages in Phase 8.
 */
export default function ExportButton({ className = '', onDone }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onDone?.();
  };
  return (
    <>
      <button type="button" className={`btn export-btn ${className}`} onClick={() => setOpen(true)}>
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
