import { usePresence } from '../state/presence.jsx';
import { colorVar } from '../lib/palette.js';

/**
 * Who's on (decision 284), in the tab row left of Changelog (owner,
 * 2026-10-17: "fun to always see"): a green dot and the computers with the
 * app open, then one dot per picked user in that user's colour. Hover for
 * the names.
 */
export default function WhoIsOn() {
  const who = usePresence();
  const computers = who.computers.length ? who.computers.map((c) => c.label).join(', ') : 'No computer has the app open';
  const users = who.users.length
    ? who.users.map((w) => `${w.name} on ${w.computers.join(' and ')}`).join(', ')
    : 'No user picked anywhere';
  return (
    <div className="who-on" aria-label="Who's on">
      <span className="who-dot is-live" title={computers}>{who.computers.length} Connected</span>
      <span className="who-users" title={users}>
        <span className="who-user-dots" aria-hidden="true">
          {who.users.length
            ? who.users.map((w) => <span key={w.id} className="who-user-dot" style={{ '--c': colorVar(w.color) }} />)
            : <span className="who-user-dot none" />}
        </span>
        {who.users.length} {who.users.length === 1 ? 'User' : 'Users'} selected
      </span>
    </div>
  );
}
