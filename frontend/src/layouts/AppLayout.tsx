import React, { useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
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
  User as UserIcon,
  Activity,
  ShoppingBag,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useUIStore } from '../stores/uiStore';
import BrandLogo from '../components/BrandLogo';
import UserAvatar from '../components/UserAvatar';
import { ToastContainer } from '../components/ui/Toast';
import api from '../services/api';

/* ─── Nav structure ──────────────────────────────────────────── */
const NAV_GROUPS = [
  {
    label: 'Core',
    items: [
      { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
      { name: 'Workout', path: '/workout', icon: Dumbbell },
      { name: 'Nutrition', path: '/nutrition', icon: Utensils },
      { name: 'Progress', path: '/progress', icon: TrendingUp },
    ],
  },
  {
    label: 'Analysis',
    items: [
      { name: 'Body Scan', path: '/scan', icon: ScanLine },
      { name: 'Vision AI', path: '/vision', icon: Video },
      { name: 'Recovery', path: '/recovery', icon: Moon },
    ],
  },
  {
    label: 'Tools',
    items: [
      { name: 'AI Coach', path: '/coach', icon: MessageSquareQuote },
      { name: 'Fortis Store', path: '/store', icon: ShoppingBag },
      { name: 'AI Usage', path: '/usage', icon: Activity },
    ],
  },
  {
    label: 'Account',
    items: [
      { name: 'Profile', path: '/profile', icon: UserIcon },
    ],
  },
];

// Flat list for the mobile bottom bar (primary 5 only)
const MOBILE_PRIMARY = ['/dashboard', '/workout', '/nutrition', '/progress', '/profile'];
const MOBILE_NAV = NAV_GROUPS.flatMap((g) => g.items).filter((i) => MOBILE_PRIMARY.includes(i.path));

/* ─── Page title map ─────────────────────────────────────────── */
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/workout': 'Workout',
  '/nutrition': 'Nutrition',
  '/recovery': 'Recovery',
  '/progress': 'Progress',
  '/vision': 'Vision AI',
  '/coach': 'AI Coach',
  '/profile': 'Profile',
  '/scan': 'Body Scan',
  '/scan/camera': 'Scan Camera',
  '/scan/processing': 'Processing Scan',
  '/scan/result': 'Scan Result',
  '/scan/blueprint': 'Blueprint',
  '/scan/history': 'Scan History',
  '/scan/comparison': 'Comparison',
  '/usage': 'AI Usage',
  '/store': 'Fortis Store',
};

/* ─── Sidebar nav link ───────────────────────────────────────── */
const SideNavLink: React.FC<{
  item: { name: string; path: string; icon: React.ElementType };
  onClick?: () => void;
}> = ({ item, onClick }) => {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${
          isActive
            ? 'bg-brand/15 text-brand-light border-l-2 border-brand pl-[10px]'
            : 'text-text-secondary hover:text-text-primary hover:bg-dark-hover border-l-2 border-transparent pl-[10px]'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-brand-light' : 'text-text-muted group-hover:text-text-secondary'}`} />
          <span className="truncate">{item.name}</span>
          {isActive && <ChevronRight className="w-3 h-3 ml-auto shrink-0 text-brand-light" />}
        </>
      )}
    </NavLink>
  );
};

/* ─── Sidebar content (shared between fixed + drawer) ───────── */
const SidebarContent: React.FC<{ onLinkClick?: () => void; onLogout: () => void }> = ({
  onLinkClick,
  onLogout,
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-center px-2 py-4 mb-2 border-b border-dark-border/50">
        <BrandLogo className="h-16 w-auto" />
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted/80">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <SideNavLink key={item.path} item={item} onClick={onLinkClick} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* User card */}
      <div className="m-3 p-3.5 bg-dark-card border border-dark-border rounded-2xl">
        <button
          onClick={() => { navigate('/profile'); onLinkClick?.(); }}
          className="flex items-center gap-2.5 mb-3 w-full text-left p-1 rounded-xl hover:bg-dark-hover transition-colors group cursor-pointer"
          title="View Profile"
        >
          <UserAvatar className="w-9 h-9 shadow-glow group-hover:ring-2 group-hover:ring-brand transition-all" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-text-primary group-hover:text-brand-light transition-colors truncate">
              {user?.name || 'Athlete'}
            </div>
            <div className="text-[10px] text-text-muted truncate">{user?.email || ''}</div>
          </div>
        </button>
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 text-xs text-text-muted hover:text-danger transition-colors py-1.5 px-2 rounded-lg hover:bg-danger/10 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </div>
    </div>
  );
};

/* ─── AppLayout ──────────────────────────────────────────────── */
export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const mobileMenuOpen = useUIStore((s) => s.mobileMenuOpen);
  const setMobileMenuOpen = useUIStore((s) => s.setMobileMenuOpen);
  const drawerRef = useRef<HTMLDivElement>(null);

  const [apiOnline, setApiOnline] = React.useState<boolean | null>(null);

  // API health check
  React.useEffect(() => {
    let mounted = true;
    const check = () =>
      api.get('/health')
        .then((res) => { if (mounted) setApiOnline(res.data?.status === 'ok'); })
        .catch(() => { if (mounted) setApiOnline(false); });
    check();
    const timer = window.setInterval(check, 30_000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  // Close drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname, setMobileMenuOpen]);

  // Trap focus + keyboard in drawer
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', handleKey);
    };
  }, [mobileMenuOpen, setMobileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate('/landing', { replace: true });
  };

  const pageTitle = PAGE_TITLES[location.pathname] || 'Fortis';

  return (
    <div className="flex min-h-screen bg-dark-bg text-text-primary">
      {/* ── Desktop Sidebar ─── */}
      <aside
        aria-label="Sidebar navigation"
        className="hidden md:flex flex-col w-60 border-r border-dark-border bg-dark-surface fixed h-full z-20 overflow-hidden"
      >
        <SidebarContent onLogout={handleLogout} />
      </aside>

      {/* ── Mobile Drawer Backdrop ─── */}
      {mobileMenuOpen && (
        <div
          aria-hidden="true"
          className="md:hidden fixed inset-0 z-30 bg-black/70 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ── Mobile Drawer ─── */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
        aria-hidden={!mobileMenuOpen}
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-72 bg-dark-surface border-r border-dark-border transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Close menu"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-dark-hover transition-colors z-10"
        >
          <X className="w-5 h-5" />
        </button>
        <SidebarContent onLinkClick={() => setMobileMenuOpen(false)} onLogout={handleLogout} />
      </div>

      {/* ── Main Content ─── */}
      <main className="flex-1 min-w-0 w-full md:ml-60 flex flex-col min-h-screen pb-16 md:pb-6">
        {/* Sticky header */}
        <header className="min-h-14 border-b border-dark-border px-3 sm:px-6 py-2 flex items-center justify-between gap-2 bg-dark-bg/90 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-3">
            {/* Hamburger (mobile only) */}
            <button
              className="md:hidden p-2 rounded-xl hover:bg-dark-hover text-text-secondary hover:text-text-primary transition-colors"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Page title */}
            <div className="flex flex-col">
              <h1 className="text-sm font-bold text-text-primary">{pageTitle}</h1>
              <span className="hidden sm:flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  apiOnline === true ? 'bg-success' :
                  apiOnline === false ? 'bg-danger' : 'bg-warning'
                }`} />
                <span className="text-[10px] font-medium text-text-muted" aria-live="polite">
                  {apiOnline === true ? 'API online' : apiOnline === false ? 'API offline' : 'Checking…'}
                </span>
              </span>
            </div>
          </div>

          {/* Right: user info + avatar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/profile')}
              className="text-right hidden sm:block group hover:opacity-90 transition-opacity cursor-pointer"
              title="View Profile"
            >
              <div className="text-xs font-bold text-text-primary group-hover:text-brand-light transition-colors">
                {user?.name || 'Athlete'}
              </div>
              <div className="text-[10px] text-text-muted">{user?.email || ''}</div>
            </button>
            <button
              onClick={() => navigate('/profile')}
              title="View Profile"
              aria-label="View Profile"
              className="rounded-full hover:ring-2 hover:ring-brand transition-all cursor-pointer"
            >
              <UserAvatar className="w-9 h-9 shadow-glow" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 flex-1">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Navigation ─── */}
      <nav
        aria-label="Primary navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-dark-surface/95 backdrop-blur border-t border-dark-border flex items-center justify-around z-30"
      >
        {MOBILE_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path ||
            (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
          return (
            <NavLink
              key={item.path}
              to={item.path}
              aria-label={item.name}
              aria-current={isActive ? 'page' : undefined}
              className="flex flex-col items-center justify-center gap-1 min-w-[56px] h-full px-2 transition-colors"
            >
              <span className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-brand/15' : ''}`}>
                <Icon className={`w-5 h-5 transition-colors ${isActive ? 'text-brand-light' : 'text-text-muted'}`} />
              </span>
              <span className={`text-[10px] font-semibold transition-colors ${isActive ? 'text-brand-light' : 'text-text-muted'}`}>
                {item.name}
              </span>
            </NavLink>
          );
        })}

        {/* More button to open drawer */}
        <button
          onClick={() => setMobileMenuOpen(true)}
          aria-label="More navigation options"
          className="flex flex-col items-center justify-center gap-1 min-w-[56px] h-full px-2 text-text-muted"
        >
          <span className="p-1.5 rounded-xl">
            <Menu className="w-5 h-5" />
          </span>
          <span className="text-[10px] font-semibold">More</span>
        </button>
      </nav>

      {/* Global toasts */}
      <ToastContainer />
    </div>
  );
};
