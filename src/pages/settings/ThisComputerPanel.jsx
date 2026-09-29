import { useEffect, useState } from 'react';
import { useDevice } from '../../state/device.jsx';
import { useSession } from '../../state/session.jsx';
import { useToast } from '../../components/Toast.jsx';

// Settings → This computer (spec 11.6): rename it, or sign out.
// (Phase 6 adds the "your in-progress buy stays saved" note to Sign out.)
export default function ThisComputerPanel() {
  const { label, setLabel } = useDevice();
  const { signOut } = useSession();
  const toast = useToast();
  const [text, setText] = useState(label ?? '');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setText(label ?? ''), [label]);

  function commit() {
    const clean = text.trim();
    if (!clean) {
      setText(label ?? '');
      return;
    }
    if (clean !== label) {
      setLabel(clean);
      toast(`This computer is now "${clean}".`, 'ok');
    }
  }

  return (
    <section className="cardpanel settings-panel">
      <div className="cardpanel-head"><strong>This computer</strong></div>
      <div className="cardpanel-body">
        <label htmlFor="device-name">Computer name</label>
        <input
          id="device-name"
          className="device-name"
          type="text"
          maxLength={40}
          placeholder="Front Counter"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
        <p className="hint">Shown on in-progress buys and on collections open here.</p>
        <button
          type="button"
          className={`btn danger-ghost${signingOut ? ' busy' : ''}`}
          onClick={async () => {
            setSigningOut(true);
            await signOut();
          }}
        >
          Sign out
        </button>
      </div>
    </section>
  );
}
