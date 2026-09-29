import { useState } from 'react';
import Modal from './Modal.jsx';
import { useDevice } from '../state/device.jsx';
import { useToast } from './Toast.jsx';

// First sign-in on a browser (spec 7.4): name this computer. It can't be
// skipped, because drafts and collection locks are labelled with it.
export default function DeviceNameModal() {
  const { setLabel } = useDevice();
  const toast = useToast();
  const [name, setName] = useState('');
  const clean = name.trim();

  function submit(e) {
    e.preventDefault();
    if (!clean) return;
    setLabel(clean);
    toast(`This computer is now "${clean}".`, 'ok');
  }

  return (
    <Modal
      title="Name this computer"
      footer={
        <button type="submit" form="device-name-form" className="btn primary" disabled={!clean}>
          Save
        </button>
      }
    >
      <form id="device-name-form" onSubmit={submit}>
        <p>
          Give this computer a name staff will recognize, like where it sits. It labels
          in-progress buys and collections open here. You can change it later in Settings.
        </p>
        <input
          type="text"
          autoFocus
          maxLength={40}
          placeholder="Front Counter"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Computer name"
        />
      </form>
    </Modal>
  );
}
