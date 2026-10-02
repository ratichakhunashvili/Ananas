import { NavLink, Outlet } from 'react-router-dom';
import { Logo } from '../../components/Logo';
import { useAuth } from '../../contexts/AuthContext';
import { logout } from '../../services/userService';

export default function AdminLayout() {
  const { profile } = useAuth();
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand" style={{ marginBottom: 22, padding: '4px 6px' }}>
          <Logo height={44} onDark />
        </div>
        <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
          Homework
        </NavLink>
        <NavLink to="/admin/questions" className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
          Question Bank
        </NavLink>
        <NavLink to="/admin/music" className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
          Music Library
        </NavLink>
        <NavLink to="/admin/spectators" className={({ isActive }) => `admin-nav-link${isActive ? ' active' : ''}`}>
          Spectators
        </NavLink>
        <div style={{ flex: 1 }} />
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem', padding: '0 12px 6px' }}>
          {profile?.displayName}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => logout()} style={{ color: 'white' }}>
          Sign out
        </button>
      </aside>
      <main className="admin-content">
        <Outlet />
      </main>
    </div>
  );
}
