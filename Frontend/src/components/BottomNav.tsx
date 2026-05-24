import { useLocation, useNavigate } from 'react-router-dom';
import { useWedding } from '../context/WeddingContext';
import { useLang } from '../context/LanguageContext';

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useWedding();
  const { t } = useLang();

  const items = [
    { path: '/dashboard', icon: '🏠', label: t('nav.home'), id: 'home' },
    { path: '/my-expenses', icon: '📋', label: t('nav.myExpenses'), id: 'my-expenses' },
    { path: '/add', icon: '+', label: t('nav.add'), isFab: true, id: 'add' },
    { path: '/all-expenses', icon: '📊', label: t('nav.all'), id: 'all' },
    {
      path: isAdmin ? '/settings' : '/members',
      icon: isAdmin ? '⚙️' : '👥',
      label: isAdmin ? t('nav.settings') : t('nav.members'),
      id: isAdmin ? 'settings' : 'members',
    },
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
