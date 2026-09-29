import { PICK_USER_FIRST, useStaff } from '../state/staff.jsx';

/**
 * A button for an action that needs a staff user picked (spec 7.3). With no
 * user it looks disabled and says "Pick a user first", and clicking it pulses
 * the user button in the header. It stays clickable (aria-disabled rather
 * than disabled) so that click can happen.
 *
 * `disabled` covers the action's own reasons (offline, busy); `title` is the
 * tooltip for those.
 */
export default function GuardButton({
  needsUser = true, disabled = false, title, className = 'btn', onClick, children, ...rest
}) {
  const { current, pulse } = useStaff();
  const noUser = needsUser && !current;
  const blocked = noUser || disabled;

  return (
    <button
      type="button"
      {...rest}
      className={`${className}${blocked ? ' is-disabled' : ''}`}
      aria-disabled={blocked || undefined}
      title={noUser ? PICK_USER_FIRST : title}
      onClick={(e) => {
        if (noUser) {
          pulse();
          return;
        }
        if (!disabled) onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
