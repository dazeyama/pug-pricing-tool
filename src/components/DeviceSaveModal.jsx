import Modal from './Modal.jsx';
import { useDevice } from '../state/device.jsx';

// Until this computer's row is in the `devices` table, nothing may write with
// its ID (drafts, collection locks and the changelog point at it). Normally a
// blink, so the dialog only fades in if the save takes a while (it reads
// "Connecting…" through the quiet retries); if every try fails, it says why
// and offers Retry, which starts a new round (owner's bug, 2026-09-30).
export default function DeviceSaveModal({ phone = false }) {
  const { label, saveError, retrySave } = useDevice();
  const what = phone ? 'phone' : 'computer';
  return (
    <Modal
      className={saveError ? '' : 'modal-late'}
      title={saveError ? `Couldn't save this ${what}` : `Connecting this ${what}…`}
      footer={saveError && (
        <button type="button" className="btn primary" autoFocus onClick={retrySave}>
          Retry
        </button>
      )}
    >
      {saveError ? (
        <>
          <p>
            <strong>{label}</strong> isn’t saved to the database yet, so {phone ? 'scanning' : 'buys and collections'}
            can’t start here. Check the connection, then Retry.
          </p>
          <div className="banner err device-save-error">{saveError}</div>
        </>
      ) : (
        <p className="loading-note">Saving <strong>{label}</strong> to the database…</p>
      )}
    </Modal>
  );
}
