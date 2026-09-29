import { colorVar } from '../lib/palette.js';

/** A staff user as the app shows them everywhere: colour dot + name. */
export default function UserTag({ user, fallback = '—' }) {
  if (!user) return <span className="muted-text">{fallback}</span>;
  return (
    <span className="user-tag">
      <span className="user-dot" style={{ '--c': colorVar(user.color) }} />
      {user.name}
    </span>
  );
}
