import { useState } from 'react';
import Modal from '../../components/Modal.jsx';
import GuardButton from '../../components/GuardButton.jsx';

/**
 * The walk-in buy's buttons under its totals (spec 8.9, 8.10): CANCEL (asks
 * first when there are cards) and CONFIRM BUY.
 */
export default function WalkInButtons({ count, busy, canEdit, onCancel, onConfirm }) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <div className="list-buttons">
        <button
          type="button"
          className="btn cancel-btn"
          disabled={busy}
          title={count ? 'Discard this buy' : 'Start over'}
          onClick={() => (count ? setAsking(true) : onCancel())}
        >
          CANCEL
        </button>
        <GuardButton
          className="btn confirm-btn"
          disabled={!count || busy || !canEdit}
          title={!count ? 'Add cards first' : busy ? 'Saving…' : !canEdit ? 'No connection' : 'Confirm this buy'}
          onClick={onConfirm}
        >
          CONFIRM BUY
        </GuardButton>
      </div>
      {asking && (
        <Modal
          title="Cancel this buy?"
          onClose={() => setAsking(false)}
          footer={(
            <>
              <button type="button" className="btn ghost" onClick={() => setAsking(false)}>Keep buy</button>
              <button
                type="button"
                className="btn danger"
                onClick={async () => {
                  setAsking(false);
                  await onCancel();
                }}
              >
                Discard
              </button>
            </>
          )}
        >
          <p><strong>{count} card{count === 1 ? '' : 's'}</strong> will be discarded.</p>
        </Modal>
      )}
    </>
  );
}
