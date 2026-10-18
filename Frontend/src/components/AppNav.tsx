import { useCallback, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';
import { WORKSPACE_ICON } from '@/types';
import BrandLogo from './BrandLogo';
import Avatar from './Avatar';
import LanguageToggle from './LanguageToggle';
import ThemeToggle from './ThemeToggle';
import RollText from './RollText';
import SignOutDialog from '@/features/auth/SignOutDialog';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  id: string;
}

// Phones/tablets get the bottom bar, desktops (≥ 1024px) the sidebar; CSS
// shows exactly one. Settings is last for every role — it holds the account
// (PIN / email / switcher) and sign-out.
export default function AppNav() {
  const { features } = useWedding();
  const { t } = useLang();

  const home = { path: '/dashboard', icon: '🏠', label: t('nav.home'), id: 'home' };
  const mine = { path: '/my-expenses', icon: '📋', label: t('nav.myExpenses'), id: 'my-expenses' };
  const settings = { path: '/settings', icon: '⚙️', label: t('nav.settings'), id: 'settings' };
  const insights = { path: '/insights', icon: '📊', label: t('nav.insights'), id: 'insights' };
  const all = { path: '/all-expenses', icon: '📊', label: t('nav.all'), id: 'all' };

  const side: NavItem[] = features.multiMember
    ? [home, mine, { ...all, label: t('nav.allExpenses') }, { path: '/members', icon: '👥', label: t('nav.members'), id: 'members' }, settings]
    : [home, mine, insights, settings];

  return (
    <>
      <BottomNav items={[home, mine, features.multiMember ? all : insights, settings]} />
      <SideNav items={side} />
    </>
  );
}

function BottomNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useLang();
  const tab = (item: NavItem) => (
    <button
      key={item.path}
      className={`nav-item ${pathname === item.path ? 'active' : ''}`}
      onClick={() => navigate(item.path)}
      id={`nav-${item.id}`}
    >
      <span className="nav-icon">{item.icon}</span>
      <span>{item.label}</span>
    </button>
  );

  return (
    <nav className="bottom-nav" id="bottom-navigation">
      {items.slice(0, 2).map(tab)}
      <button
        className={`nav-item ${pathname === '/add' ? 'active' : ''}`}
        onClick={() => navigate('/add')}
        id="nav-add"
        aria-label={t('nav.add')}
      >
        <span className="fab-add">+</span>
      </button>
      {items.slice(2).map(tab)}
    </nav>
  );
}

function SideNav({ items }: { items: NavItem[] }) {
  const navigate = useNavigate();
  const { wedding, member, workspaceType } = useWedding();
  const { t } = useLang();
  const [signingOut, setSigningOut] = useState(false);
  const closeSignOut = useCallback(() => setSigningOut(false), []);
  const name = member?.name || '';

  return (
    <aside className="side-nav" aria-label={t('nav.label')}>
      <div className="side-nav-brand">
        <BrandLogo size={32} title="" />
        <span>{t('nav.brand')}</span>
      </div>

      <div className="side-nav-workspace">
        <span className="side-nav-ws-icon" aria-hidden="true">{WORKSPACE_ICON[workspaceType] ?? '💼'}</span>
        <span style={{ minWidth: 0 }}>
          <span className="side-nav-ws-name" title={wedding?.weddingName}>{wedding?.weddingName}</span>
          <span className="side-nav-ws-meta">{t(`switch.type.${workspaceType}`)}</span>
        </span>
      </div>

      <button type="button" className="btn btn-primary btn-full" onClick={() => navigate('/add')} id="side-nav-add">
        <RollText>{`＋ ${t('add.header')}`}</RollText>
      </button>

      <nav>
        <ul className="side-nav-links">
          {items.map((item) => (
            <li key={item.path}>
              <NavLink to={item.path} className="side-nav-link" id={`side-nav-${item.id}`}>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="side-nav-foot">
        <div className="side-nav-user">
          <Avatar name={name} src={member?.avatar} size={36} />
          <span style={{ minWidth: 0 }}>
            <span className="side-nav-ws-name" title={name}>{name}</span>
            <span className="side-nav-ws-meta">{t(member?.role === 'admin' ? 'switch.admin' : 'switch.member')}</span>
          </span>
        </div>
        <div className="side-nav-prefs">
          <LanguageToggle />
          <ThemeToggle />
          <button type="button" className="side-nav-logout" onClick={() => setSigningOut(true)} aria-label={t('nav.signOut')} id="side-nav-logout">
            <span className="side-nav-logout-icon" aria-hidden="true">
              <svg viewBox="0 0 512 512" focusable="false"><path d={LOGOUT_ICON} /></svg>
            </span>
            <span className="side-nav-logout-text" aria-hidden="true">{t('nav.signOut')}</span>
          </button>
        </div>
      </div>
      {signingOut && <SignOutDialog onClose={closeSignOut} />}
    </aside>
  );
}

const LOGOUT_ICON = 'M377.9 105.9L500.7 228.7c7.2 7.2 11.3 17.1 11.3 27.3s-4.1 20.1-11.3 27.3L377.9 406.1c-6.4 6.4-15 9.9-24 9.9c-18.7 0-33.9-15.2-33.9-33.9l0-62.1-128 0c-17.7 0-32-14.3-32-32l0-64c0-17.7 14.3-32 32-32l128 0 0-62.1c0-18.7 15.2-33.9 33.9-33.9c9 0 17.6 3.6 24 9.9zM160 96L96 96c-17.7 0-32 14.3-32 32l0 256c0 17.7 14.3 32 32 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32l-64 0c-53 0-96-43-96-96L0 128C0 75 43 32 96 32l64 0c17.7 0 32 14.3 32 32s-14.3 32-32 32z';
