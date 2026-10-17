import { useLocation, useNavigate } from 'react-router-dom';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  id: string;
  isFab?: boolean;
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin, features } = useWedding();
  const { t } = useLang();

  // Features-driven nav (Phase 2). Single-member verticals (Personal) drop the
  // AllExpenses and Members tabs since neither makes sense — the lone owner
  // sees their own list under MyExpenses and there's no one to manage.
  const items: NavItem[] = [
    { path: '/dashboard', icon: '🏠', label: t('nav.home'), id: 'home' },
    { path: '/my-expenses', icon: '📋', label: t('nav.myExpenses'), id: 'my-expenses' },
    { path: '/add', icon: '+', label: t('nav.add'), isFab: true, id: 'add' },
  ];
  if (features.multiMember) {
    items.push({ path: '/all-expenses', icon: '📊', label: t('nav.all'), id: 'all' });
    items.push({
      path: isAdmin ? '/settings' : '/members',
      icon: isAdmin ? '⚙️' : '👥',
      label: isAdmin ? t('nav.settings') : t('nav.members'),
      id: isAdmin ? 'settings' : 'members',
    });
  } else {
    // Personal: admin-only by construction (the lone owner). Insights
    // (L1 — Reports) takes the slot Wedding uses for Members; Settings
    // remains the last tab. Final order: Home · MyExpenses · + · Insights ·
    // Settings (5 tabs, no overcrowding).
    items.push({ path: '/insights', icon: '📊', label: t('nav.insights'), id: 'insights' });
    items.push({ path: '/settings', icon: '⚙️', label: t('nav.settings'), id: 'settings' });
  }

  return (
    <nav className="bottom-nav" id="bottom-navigation">
      {items.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
          id={`nav-${item.id}`}
        >
          {item.isFab ? (
            <span className="fab-add">+</span>
          ) : (
            <>
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </>
          )}
        </button>
      ))}
    </nav>
  );
}
