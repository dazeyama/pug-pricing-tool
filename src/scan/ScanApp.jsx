import { useState } from 'react';
import { useDevice } from '../state/device.jsx';
import DeviceNameModal from '../components/DeviceNameModal.jsx';
import DeviceSaveModal from '../components/DeviceSaveModal.jsx';
import LandingPage from './LandingPage.jsx';
import Scanner from './Scanner.jsx';
import { hasFloatingToolbar } from '../lib/mobile.js';

const LOGO = `${import.meta.env.BASE_URL}pug-logo.webp`;

/**
 * The scanner (docs/SCAN_FUNCTION.md 5): what a phone gets instead of the
 * desktop app, and #/scan on any device. Name the phone once, pick a
 * computer to pair with (LandingPage), then scan into it (Scanner). When the
 * pairing ends, back to the list, saying why.
 */
export default function ScanApp() {
  const { deviceId, label, saved } = useDevice();
  const [computer, setComputer] = useState(null);
  const [notice, setNotice] = useState(null);

  let body;
  if (!label) body = <DeviceNameModal phone />;
  else if (!saved) body = <DeviceSaveModal phone />;
  else if (computer) {
    body = (
      <Scanner
        key={computer}
        computerId={computer}
        phoneId={deviceId}
        onEnd={(message) => {
          setComputer(null);
          setNotice(message);
        }}
      />
    );
  } else {
    body = (
      <LandingPage
        phoneId={deviceId}
        notice={notice}
        onPaired={(id) => {
          setNotice(null);
          setComputer(id);
        }}
      />
    );
  }

  // Scanning, everything fits the screen with no scrolling (owner, 2026-10-16):
  // no brand header, and room kept for Safari's floating toolbar on an iPhone.
  const scanning = Boolean(computer && label && saved);
  return (
    <div className={`scan-app${scanning ? ' scanning' : ''}${scanning && hasFloatingToolbar() ? ' ios-bar' : ''}`}>
      {!scanning && (
        <header className="scan-brand">
          <img src={LOGO} alt="" width="36" height="36" />
          <div>
            <strong>PUG Pricing Tool</strong>
            <span>{label ? `Card scanner · ${label}` : 'Card scanner'}</span>
          </div>
        </header>
      )}
      {body}
    </div>
  );
}
