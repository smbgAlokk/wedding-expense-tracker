import { useLocation, useNavigate } from 'react-router-dom';
import { useWedding } from '@/context/WeddingContext';
import { useLang } from '@/context/LanguageContext';

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
  const { features } = useWedding();
  const { t } = useLang();

  // Settings is the last tab for every role — it holds the account (PIN / email),
  // sign-out, and the "View Family Members" link. The 4th slot is per-vertical.
  const items: NavItem[] = [
    { path: '/dashboard', icon: '🏠', label: t('nav.home'), id: 'home' },
    { path: '/my-expenses', icon: '📋', label: t('nav.myExpenses'), id: 'my-expenses' },
    { path: '/add', icon: '+', label: t('nav.add'), isFab: true, id: 'add' },
    features.multiMember
      ? { path: '/all-expenses', icon: '📊', label: t('nav.all'), id: 'all' }
      : { path: '/insights', icon: '📊', label: t('nav.insights'), id: 'insights' },
    { path: '/settings', icon: '⚙️', label: t('nav.settings'), id: 'settings' },
  ];

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
