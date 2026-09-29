import { useRef, useState } from 'react';
import { useSession } from '../state/session.jsx';

const LOGO = `${import.meta.env.BASE_URL}pug-logo.webp`;

// The shared store password (spec 4.4). One field; a wrong password shows an
// inline error with no lockout.
export default function LoginPage() {
  const { signIn } = useSession();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const field = useRef(null);

  async function submit(e) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const message = await signIn(password);
    // On success the session changes and this screen unmounts.
    if (message) {
      setError(message);
      setBusy(false);
      field.current?.select();
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <img className="login-logo" src={LOGO} alt="Players' Union Games" width="150" height="150" />
        <h1>PUG Pricing Tool</h1>
        <p className="brand-sub">Players' Union Games</p>
        <form className="login-form" onSubmit={submit}>
          <label htmlFor="store-password">Store password</label>
          <input
            id="store-password"
            ref={field}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="login-error" role="alert">{error}</p>
          <button type="submit" className={`btn primary${busy ? ' busy' : ''}`} disabled={!password}>
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
