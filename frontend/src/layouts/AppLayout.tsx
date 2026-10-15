import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Dumbbell,
  Utensils,
  Moon,
  TrendingUp,
  Video,
  MessageSquareQuote,
  ScanLine,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import BrandLogo from '../components/BrandLogo';
import UserAvatar from '../components/UserAvatar';
import api from '../services/api';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Scan', path: '/scan', icon: ScanLine },
  { name: 'Workout', path: '/workout', icon: Dumbbell },
  { name: 'Nutrition', path: '/nutrition', icon: Utensils },
  { name: 'Recovery', path: '/recovery', icon: Moon },
  { name: 'Progress', path: '/progress', icon: TrendingUp },
  { name: 'Vision', path: '/vision', icon: Video },
  { name: 'AI Coach', path: '/coach', icon: MessageSquareQuote },
];

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const check = () => api.get('/health')
      .then((res) => { if (mounted) setApiOnline(res.data?.status === 'ok'); })
      .catch(() => { if (mounted) setApiOnline(false); });
    check();
    const timer = window.setInterval(check, 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/landing', { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-dark-bg text-text-primary">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 border-r border-dark-border bg-dark-surface p-4 fixed h-full z-20">
        {/* Logo */}
        <div className="flex items-center justify-center px-2 py-3 mb-5">
          <BrandLogo className="h-20 w-auto" />
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-brand/15 text-brand-light border-l-2 border-brand'
                      : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover border-l-2 border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.name}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User card + logout */}
        <div className="mt-4 p-3.5 bg-dark-card border border-dark-border rounded-2xl">
          <div className="flex items-center gap-2.5 mb-3">
            <UserAvatar className="w-9 h-9 shadow-glow" />
            <div className="min-w-0">
              <div className="text-xs font-bold text-text-primary truncate">{user?.name || 'User'}</div>
              <div className="text-[10px] text-text-muted truncate">{user?.email || ''}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 text-xs text-text-muted hover:text-danger transition-colors py-1.5 px-2 rounded-lg hover:bg-danger/10"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 md:ml-60 flex flex-col min-h-screen pb-20 md:pb-6">
        <header className="h-14 border-b border-dark-border px-6 flex items-center justify-between bg-dark-bg/80 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${apiOnline === true ? 'bg-success' : apiOnline === false ? 'bg-danger' : 'bg-warning'}`} />
            <span className="text-xs font-semibold text-text-secondary tracking-wide" aria-live="polite">
              {apiOnline === true ? 'Fortis API Online' : apiOnline === false ? 'Fortis API Offline' : 'Checking Fortis API…'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <div className="text-xs font-bold text-text-primary">{user?.name || 'User'}</div>
              <div className="text-[10px] text-text-muted">{user?.email || ''}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              aria-label="Sign out"
              className="rounded-full hover:ring-2 hover:ring-brand transition-all"
            >
              <UserAvatar className="w-9 h-9 shadow-glow" />
            </button>
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8 flex-1">{children}</div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-dark-surface/95 backdrop-blur border-t border-dark-border flex items-center justify-around px-2 z-30">
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-14 h-full gap-1 ${
                  isActive ? 'text-brand-light' : 'text-text-muted'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
