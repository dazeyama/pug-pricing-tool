// The staff-user button (spec 7.3), left of the search bar. Phase 1 draws the
// empty "Pick user" state only; the menu, adding users and colours arrive in
// Phase 2 with the staff_users table.
export default function UserMenu() {
  return (
    <button type="button" className="user-btn" title="Staff users arrive in Phase 2">
      <span className="user-name none">Pick user</span>
      <span className="caret" aria-hidden="true">▾</span>
    </button>
  );
}
