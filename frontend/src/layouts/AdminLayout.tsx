import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Activity, Boxes, ClipboardList, LayoutDashboard, LogOut, Menu, Settings, ShoppingBag, Store, Tags, X } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/products', label: 'Products', icon: ShoppingBag },
  { to: '/admin/categories', label: 'Categories', icon: Tags },
  { to: '/admin/inventory', label: 'Inventory', icon: Boxes },
  { to: '/admin/orders', label: 'Orders', icon: ClipboardList },
  { to: '/admin/settings', label: 'Store settings', icon: Settings },
];

export function AdminRouteGuard() {
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const token = useAuthStore(s => s.token);
  const updateUser = useAuthStore(s => s.updateUser);
  const logout = useAuthStore(s => s.logout);
  const location = useLocation();
  const [access, setAccess] = useState<'checking' | 'allowed' | 'denied' | 'unauthenticated' | 'error'>('checking');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    if (!authenticated || !token) { setAccess('unauthenticated'); return () => { current = false; }; }
    setAccess('checking');
    api.get('/api/auth/me').then(({ data }) => {
      if (!current) return;
      updateUser({ id: data.user_id, name: data.name, email: data.email, is_admin: !!data.is_admin });
      setAccess(data.is_admin ? 'allowed' : 'denied');
    }).catch(err => {
      if (!current) return;
      if (err.response?.status === 401 || err.response?.status === 403) { logout(); setAccess('unauthenticated'); }
      else setAccess('error');
    });
    return () => { current = false; };
  }, [authenticated, token, updateUser, logout, retry]);

  if (access === 'checking') return <div className="grid min-h-screen place-items-center bg-[#0b0b0e] text-sm text-white/60">Checking administrator access…</div>;
  if (access === 'unauthenticated') return <Navigate to={`/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (access === 'denied') return <Navigate to="/admin/access-denied" replace />;
  if (access === 'error') return <div className="grid min-h-screen place-items-center bg-[#0b0b0e] p-6 text-center text-white"><div><p>Could not verify your session. Check your connection and retry.</p><button className="fortis-btn-primary mt-4" onClick={() => setRetry(n => n + 1)}>Retry</button></div></div>;
  return <Outlet />;
}

export function AdminAccessDeniedPage() {
  return <main className="grid min-h-screen place-items-center bg-[#0b0b0e] p-6 text-center text-white"><div className="max-w-md"><p className="text-xs font-bold uppercase tracking-[.2em] text-brand-light">FORTIS ADMIN</p><h1 className="mt-3 text-2xl font-black">Administrator access required</h1><p className="mt-2 text-sm text-white/60">This account does not have permission to manage the store.</p><Link to="/store" className="fortis-btn-secondary mt-6 inline-flex">Return to the store</Link></div></main>;
}

export function AdminLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);
  const navigate = useNavigate();
  const location = useLocation();
  const current = links.find(link => location.pathname.startsWith(link.to)) || links[0];
  const SidebarContent = () => <>
    <Link to="/admin/dashboard" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 border-b border-white/[.08] px-5 py-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-white"><Activity size={20} /></span><span><b className="block text-sm tracking-[.14em]">FORTIS</b><span className="text-[10px] font-bold uppercase tracking-[.18em] text-brand-light">Store Admin</span></span></Link>
    <nav className="flex-1 space-y-1 p-3" aria-label="Admin navigation">{links.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} onClick={() => setMenuOpen(false)} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${isActive ? 'bg-brand/15 text-brand-light' : 'text-white/65 hover:bg-white/[.05] hover:text-white'}`}><Icon size={17} />{label}</NavLink>)}</nav>
    <div className="space-y-2 border-t border-white/[.08] p-3"><Link onClick={() => setMenuOpen(false)} to="/store" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/65 hover:bg-white/[.05] hover:text-white"><Store size={17} />View Store</Link><div className="mt-3 flex items-center gap-3 rounded-xl bg-white/[.04] p-3"><div className="grid h-9 w-9 place-items-center rounded-full bg-brand/20 text-xs font-bold text-brand-light">{user?.name?.slice(0, 1).toUpperCase() || 'A'}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{user?.name || 'Administrator'}</p><p className="text-[10px] text-white/45">Store administrator</p></div><button aria-label="Sign out" title="Sign out" onClick={() => { logout(); navigate('/auth/login', { replace: true }); }} className="rounded-lg p-2 text-white/50 hover:bg-white/10 hover:text-white"><LogOut size={16} /></button></div></div>
  </>;

  return <div className="min-h-screen bg-[#0b0b0e] text-white md:pl-64">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/[.08] bg-[#101014] md:flex"><SidebarContent /></aside>
    {menuOpen && <div className="fixed inset-0 z-50 md:hidden"><button aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="absolute inset-0 bg-black/70"/><aside className="absolute inset-y-0 left-0 flex w-[min(82vw,300px)] flex-col border-r border-white/10 bg-[#101014]"><button onClick={() => setMenuOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-lg p-2 text-white/60"><X size={18}/></button><SidebarContent /></aside></div>}
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[.08] bg-[#0b0b0e]/90 px-4 backdrop-blur sm:px-7"><div className="flex items-center gap-3"><button onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-lg p-2 text-white/70 hover:bg-white/10 md:hidden"><Menu size={20}/></button><div><p className="text-[10px] font-bold uppercase tracking-[.17em] text-white/40">Store administration</p><h1 className="text-sm font-bold sm:text-base">{current.label}</h1></div></div><div className="flex items-center gap-2"><Link to="/store" className="fortis-btn-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><Store size={14}/>View Store</Link><span className="hidden text-xs text-white/55 sm:block">{user?.name}</span></div></header>
    <main className="mx-auto max-w-[1500px] p-4 sm:p-7 lg:p-9"><Outlet /></main>
  </div>;
}
