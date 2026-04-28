import { useLocation, useNavigate } from 'react-router-dom';
import { useWedding } from '../context/WeddingContext';

export default function BottomNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useWedding();

  const items = [
    { path: '/dashboard', icon: '🏠', label: 'Home' },
    { path: '/my-expenses', icon: '📋', label: 'My Expenses' },
    { path: '/add', icon: '+', label: 'Add', isFab: true },
    { path: '/all-expenses', icon: '📊', label: 'All' },
    { path: isAdmin ? '/settings' : '/members', icon: isAdmin ? '⚙️' : '👥', label: isAdmin ? 'Settings' : 'Members' },
  ];

  return (
    <nav className="bottom-nav" id="bottom-navigation">
      {items.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
          id={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
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
