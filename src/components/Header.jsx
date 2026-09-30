import { useLocation } from 'react-router-dom';
import UserMenu from './UserMenu.jsx';
import SearchBox from './SearchBox.jsx';
import Tabs from './Tabs.jsx';

const LOGO = `${import.meta.env.BASE_URL}pug-logo.webp`;

/** The Price tab and a collection's pricing screen: the header search stays its normal size there. */
export function isPricingScreen(pathname) {
  return pathname === '/price' || /^\/collections\/[^/]+$/.test(pathname);
}

// CM's header (spec 7.2): brand on the left, user + search on the right,
// tabs underneath.
export default function Header() {
  const { pathname } = useLocation();

  return (
    <header>
      <div className="header-top">
        <div className="brand">
          <img className="brand-mark" src={LOGO} alt="" width="52" height="52" />
          <div className="brand-text">
            <h1>PUG Pricing Tool</h1>
            <p className="brand-sub">Players' Union Games</p>
          </div>
        </div>
        <div className="header-right">
          <UserMenu />
          <SearchBox wide={!isPricingScreen(pathname)} />
        </div>
      </div>
      <Tabs />
    </header>
  );
}
