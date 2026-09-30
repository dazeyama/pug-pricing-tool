import Modal from './Modal.jsx';
import { useDevice } from '../state/device.jsx';

// Until this computer's row is in the `devices` table, nothing may write with
// its ID (drafts, collection locks and the changelog point at it). Normally a
// blink, so the dialog only fades in if the save takes a while; if the save
// fails, it says why and offers Retry (owner's bug, 2026-09-30).
export default function DeviceSaveModal() {
  const { label, saveError, retrySave } = useDevice();
  return (
    <Modal
      className={saveError ? '' : 'modal-late'}
      title={saveError ? "Couldn't save this computer" : 'Connecting this computer…'}
      footer={saveError && (
        <button type="button" className="btn primary" autoFocus onClick={retrySave}>
          Retry
        </button>
      )}
    >
      {saveError ? (
        <>
          <p>
            <strong>{label}</strong> isn’t saved to the database yet, so buys and collections
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
