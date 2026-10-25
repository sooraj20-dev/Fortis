import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronDown, CircleAlert, Copy, Heart, Home, Minus, Package, Plus,
  Search, Share2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Trash2, Truck, X, Zap,
} from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import BrandLogo from '../../components/BrandLogo';
import { storeApi } from './storeApi';
import type { CartSummary, StoreCategory, StoreProduct } from './storeTypes';
import { inr } from './storeTypes';
import { API_URL } from '../../services/api';

const imageSrc = (image: string) => {
  return image.startsWith('/') ? `${API_URL}${image}` : image;
};
const productImageSrc = imageSrc;

const createIdempotencyKey = () => {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') globalThis.crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const blankCart: CartSummary = { items: [], subtotal_paise: 0, shipping_paise: 0, total_paise: 0, currency: 'INR' };
const readGuest = (): CartSummary => { try { return JSON.parse(localStorage.getItem('fortis-store-guest-cart') || 'null') || blankCart; } catch { return blankCart; } };
const writeGuest = (cart: CartSummary) => { try { localStorage.setItem('fortis-store-guest-cart', JSON.stringify(cart)); } catch { /* storage full or blocked */ } };
const recalc = (c: CartSummary): CartSummary => {
  const subtotal = c.items.reduce((s, i) => s + i.line_total_paise, 0);
  return { ...c, subtotal_paise: subtotal, total_paise: subtotal + (c.shipping_paise || 0) };
};
const categoryLabel = (categories: StoreCategory[], id: string) => categories.find(c => c.slug === id)?.name || id;

/** Small localStorage-backed list (wishlist, recently viewed). */
function useStoredList<T>(key: string): [T[], (fn: (l: T[]) => T[]) => void] {
  const [list, setList] = useState<T[]>(() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } });
  const update = useCallback((fn: (l: T[]) => T[]) => setList(prev => {
    const next = fn(prev);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }), [key]);
  return [list, update];
}

function useLockBody(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [locked]);
}

const stockInfo = (n: number) =>
  n <= 0 ? { label: 'Unavailable', dot: 'bg-red-400', text: 'text-red-300' }
    : n <= 5 ? { label: `Only ${n} left`, dot: 'bg-amber-400', text: 'text-amber-300' }
      : { label: 'In stock', dot: 'bg-emerald-400', text: 'text-emerald-300' };

const ORDER_STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ small components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[.06] ${className}`} aria-hidden="true" />;
}

function ProductSkeletons({ n = 8 }: { n?: number }) {
  return <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4" aria-busy="true" aria-label="Loading products">
    {Array.from({ length: n }).map((_, i) => <div key={i}><Skeleton className="aspect-[4/4.4] !rounded-2xl" /><Skeleton className="mt-3 h-3 w-1/3" /><Skeleton className="mt-2 h-4 w-3/4" /><Skeleton className="mt-3 h-8 w-full" /></div>)}
  </div>;
}

function ProductCard({ product, categories, onAdd, onBuy, onQuick, saved, onSave, busy, className = '' }: {
  product: StoreProduct; categories: StoreCategory[]; onAdd: (p: StoreProduct) => Promise<boolean>; onBuy: (p: StoreProduct) => void; onQuick: (p: StoreProduct) => void;
  saved: boolean; onSave: (p: StoreProduct) => void; busy: boolean; className?: string;
}) {
  const stock = stockInfo(product.stock_quantity);
  return <article className={`group flex min-w-0 flex-col ${className}`}>
    <div className="relative aspect-[4/4.4] overflow-hidden rounded-xl bg-[#17171d] sm:rounded-2xl">
      <Link to={`/store/product/${product.slug}`} aria-label={`View ${product.name}`} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
        {product.image
          ? <img src={productImageSrc(product.image)} alt={product.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]" />
          : <div className="grid h-full w-full place-items-center bg-[radial-gradient(ellipse_at_70%_20%,rgba(249,115,22,.15),transparent_55%),linear-gradient(140deg,#202027,#101014)]"><Package className="h-12 w-12 text-white/20" aria-hidden="true" /></div>}
      </Link>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5">
        <div className="flex flex-col items-start gap-1.5">
          {product.featured && <span className="rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white backdrop-blur">Featured</span>}
          {product.stock_quantity > 0 && product.stock_quantity <= 5 && <span className="rounded-full bg-amber-500/90 px-2.5 py-1 text-[10px] font-bold text-black">{stock.label}</span>}
        </div>
        <button onClick={() => onSave(product)} aria-pressed={saved} aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`}
          className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-black/65 backdrop-blur transition hover:bg-black/85 active:scale-90">
          <Heart size={16} className={`transition ${saved ? 'fill-brand text-brand scale-110' : 'text-white'}`} />
        </button>
      </div>
      <button onClick={() => onQuick(product)}
        className="absolute inset-x-2.5 bottom-2.5 hidden items-center justify-center gap-1.5 rounded-xl bg-black/75 py-2 text-xs font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100 focus-visible:opacity-100 md:flex">
        <Zap size={13} /> Quick view
      </button>
    </div>
    <div className="flex flex-1 flex-col pt-3">
      <div className="truncate text-[11px] text-text-muted">{categoryLabel(categories, product.category_id)}</div>
      <Link to={`/store/product/${product.slug}`} className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-text-primary hover:text-brand-light sm:text-[15px]">{product.name}</Link>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span className="font-bold tabular-nums text-white">{inr(product.price_paise)}</span>
        {product.variants?.length ? <Link to={`/store/product/${product.slug}`} className="flex h-9 w-full items-center justify-center rounded-lg bg-white/[.07] px-3 text-xs font-semibold hover:bg-brand">Choose options</Link>
          : <div className="grid w-full grid-cols-2 gap-1.5">
            <button onClick={() => onAdd(product)} disabled={!product.stock_quantity || product.demo_only || busy}
              className="flex h-9 items-center justify-center gap-1 rounded-lg bg-white/[.07] px-2 text-[11px] font-semibold text-white transition hover:bg-white/15 active:scale-95 disabled:opacity-40 sm:text-xs"
              aria-label={`Add ${product.name} to bag`}><Plus size={13} /> Add</button>
            <button onClick={() => onBuy(product)} disabled={!product.stock_quantity || product.demo_only || busy}
              className="flex h-9 items-center justify-center rounded-lg bg-brand px-2 text-[11px] font-semibold text-white transition hover:bg-brand-light active:scale-95 disabled:opacity-40 sm:text-xs">Buy now</button>
          </div>}
      </div>
    </div>
  </article>;
}

function Rail({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <section className="mb-10">
    <div className="mb-4"><h2 className="text-lg font-bold sm:text-xl">{title}</h2>{subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}</div>
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
  </section>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ cart drawer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function CartDrawer({ open, onClose, cart, count, onQty, onRemove, onCheckout }: {
  open: boolean; onClose: () => void; cart: CartSummary; count: number;
  onQty: (id: string, q: number) => void; onRemove: (id: string) => void; onCheckout: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useLockBody(open);
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
    <div onClick={onClose} className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
    <aside role="dialog" aria-modal="true" aria-label="Your bag"
      className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0e0e12] transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4">
        <h2 className="text-lg font-bold">Your bag <span className="text-sm font-normal text-text-muted">({count})</span></h2>
        <button ref={closeRef} onClick={onClose} aria-label="Close bag" className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/10"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto px-5">
        {cart.items.length === 0
          ? <div className="grid h-full place-items-center text-center"><div><ShoppingBag className="mx-auto h-10 w-10 text-text-muted" /><p className="mt-4 font-semibold">Your bag is empty</p><p className="mt-1 text-sm text-text-muted">Add gear and it will show up here.</p><button onClick={onClose} className="mt-5 text-sm font-semibold text-brand-light">Keep browsing</button></div></div>
          : <ul className="divide-y divide-white/[.07]">{cart.items.map(i => <li key={i.item_id} className="flex gap-3 py-4">
            <Link to={`/store/product/${i.product.slug}`} onClick={onClose} className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-dark-card">{i.product.image ? <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" /> : <Package className="m-6 text-text-muted" />}</Link>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-2"><div><Link to={`/store/product/${i.product.slug}`} onClick={onClose} className="line-clamp-2 text-sm font-semibold">{i.product.name}</Link>{i.variant_name && <p className="mt-0.5 text-[11px] text-text-muted">{i.variant_name}</p>}</div><button onClick={() => onRemove(i.item_id)} aria-label={`Remove ${i.product.name}`} className="text-text-muted hover:text-red-300"><Trash2 size={15} /></button></div>
              {!i.available && <p className="mt-1 text-xs text-amber-300">Availability changed. Review before checkout.</p>}
              <div className="mt-2 flex items-center justify-between">
                <div className="flex items-center rounded-lg border border-white/10">
                  <button aria-label="Decrease quantity" onClick={() => i.quantity > 1 ? onQty(i.item_id, i.quantity - 1) : onRemove(i.item_id)} className="grid h-8 w-8 place-items-center"><Minus size={13} /></button>
                  <span className="w-6 text-center text-xs font-semibold">{i.quantity}</span>
                  <button aria-label="Increase quantity" disabled={i.quantity >= i.product.stock_quantity} onClick={() => onQty(i.item_id, i.quantity + 1)} className="grid h-8 w-8 place-items-center disabled:opacity-30"><Plus size={13} /></button>
                </div>
                <b className="text-sm">{inr(i.line_total_paise)}</b>
              </div>
            </div>
          </li>)}</ul>}
      </div>
      {cart.items.length > 0 && <div className="border-t border-white/[.08] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex justify-between text-sm text-text-secondary"><span>Subtotal</span><b className="text-white">{inr(cart.subtotal_paise)}</b></div>
        <p className="mt-1 text-[11px] text-text-muted">Shipping and taxes are not configured yet. No payment is collected.</p>
        <button onClick={onCheckout} className="fortis-btn-primary mt-4 flex w-full items-center justify-center gap-2">Checkout <ArrowRight size={15} /></button>
        <Link to="/store/cart" onClick={onClose} className="mt-3 block text-center text-xs text-text-muted hover:text-white">View full bag</Link>
      </div>}
    </aside>
  </div>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ quick view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function QuickView({ product, categories, onClose, onAdd, busy }: { product: StoreProduct | null; categories: StoreCategory[]; onClose: () => void; onAdd: (p: StoreProduct) => void; busy: boolean }) {
  useLockBody(!!product);
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);
  if (!product) return null;
  const stock = stockInfo(product.stock_quantity);
  return <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={product.name}>
    <div onClick={onClose} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
    <div className="relative grid max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-[#0e0e12] sm:grid-cols-2 sm:rounded-3xl">
      <button onClick={onClose} aria-label="Close quick view" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/60"><X size={16} /></button>
      <div className="aspect-[4/3] bg-dark-card sm:aspect-auto">{product.image ? <img src={productImageSrc(product.image)} alt={product.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><Package className="h-16 w-16 text-white/20" /></div>}</div>
      <div className="flex flex-col p-5 sm:p-7">
        <p className="text-xs text-text-muted">{categoryLabel(categories, product.category_id)}{product.brand ? ` Â· ${product.brand}` : ''}</p>
        <h3 className="mt-1 text-xl font-bold">{product.name}</h3>
        <p className="mt-3 text-2xl font-bold">{inr(product.price_paise)}</p>
        {product.stock_quantity > 0 && <div className="mt-2 flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${stock.dot}`} /><span className={stock.text}>{stock.label}</span></div>}
        <p className="mt-4 line-clamp-4 text-sm leading-6 text-text-secondary">{product.description || 'Product details will be available soon.'}</p>
        <div className="mt-6 flex gap-2 sm:mt-auto">
          {product.variants?.length ? <Link to={`/store/product/${product.slug}`} onClick={onClose} className="fortis-btn-primary flex-1 text-center">Choose options</Link> : <button disabled={!product.stock_quantity || product.demo_only || busy} onClick={() => { onAdd(product); onClose(); }} className="fortis-btn-primary flex-1">Add to bag</button>}
          <Link to={`/store/product/${product.slug}`} onClick={onClose} className="fortis-btn-secondary">Details</Link>
        </div>
      </div>
    </div>
  </div>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export default function StorePage() {
  const location = useLocation(); const navigate = useNavigate(); const [searchParams, setSearchParams] = useSearchParams();
  const authenticated = useAuthStore(s => s.isAuthenticated); const user = useAuthStore(s => s.user);
  const brandHome = user?.is_admin ? '/admin/dashboard' : authenticated ? '/dashboard' : '/store';

  const [categories, setCategories] = useState<StoreCategory[]>([]);
  const [catalog, setCatalog] = useState<{ items: StoreProduct[]; total: number; pages: number }>({ items: [], total: 0, pages: 0 });
  const [featuredProducts, setFeaturedProducts] = useState<StoreProduct[]>([]);
  const [featuredLoaded, setFeaturedLoaded] = useState(false);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [cart, setCart] = useState<CartSummary>(readGuest);
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [productLoadFailed, setProductLoadFailed] = useState(false);
  const [related, setRelated] = useState<StoreProduct[]>([]);
  const [orders, setOrders] = useState<any[]>([]); const [order, setOrder] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState(''); const [toast, setToast] = useState(''); const [preview, setPreview] = useState<any>(null);
  const [drawer, setDrawer] = useState(false); const [quick, setQuick] = useState<StoreProduct | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [bump, setBump] = useState(false);
  const [saved, updateSaved] = useStoredList<StoreProduct>('fortis-store-saved');
  const [recent, updateRecent] = useStoredList<StoreProduct>('fortis-store-recent');

  const path = location.pathname; const isProduct = path.includes('/product/'); const slug = path.split('/product/')[1];
  const isCheckout = path.endsWith('/checkout'); const isCart = path.endsWith('/cart'); const isOrders = path.endsWith('/orders'); const orderId = path.split('/orders/')[1];
  const isAdmin = path.endsWith('/admin');
  const isCatalog = !isProduct && !isCart && !isCheckout && !isOrders && !orderId && !isAdmin;
  const q = searchParams.get('q') || ''; const category = searchParams.get('category') || ''; const sort = searchParams.get('sort') || 'recommended';
  const page = Number(searchParams.get('page') || '1'); const available = searchParams.get('available') === 'true'; const showSaved = searchParams.get('saved') === '1';
  const count = cart.items.reduce((n, x) => n + x.quantity, 0);
  const isSaved = (p: StoreProduct) => saved.some(s => s.id === p.id);
  const [searchText, setSearchText] = useState(q);

  /* data */
  useEffect(() => { storeApi.categories().then(setCategories).catch(() => setCategories([])); }, []);
  useEffect(() => {
    storeApi.products({ search: '', category: '', sort: 'recommended', page: 1, available: false, featured: true, limit: 9 })
      .then(result => setFeaturedProducts(result.items))
      .catch(() => setFeaturedProducts([]))
      .finally(() => setFeaturedLoaded(true));
  }, []);
  useEffect(() => {
    if (authenticated) {
      const guest = readGuest();
      if (guest.items.length) {
        (async () => {
          try { let merged = await storeApi.cart(); for (const item of guest.items) merged = await storeApi.add(item.product.id, item.quantity, item.variant_id); setCart(merged); writeGuest(blankCart); }
          catch (e: any) { setCart(guest); setError(e.response?.data?.detail || 'Some guest cart items could not be merged. Please review availability.'); }
        })();
      } else storeApi.cart().then(setCart).catch(() => setCart(blankCart));
    } else setCart(readGuest());
  }, [authenticated]);
  useEffect(() => {
    let alive = true; setError('');
    if (isCatalog && !showSaved) {
      setLoadingCatalog(true);
      storeApi.products({ search: q, category, sort, page, available, limit: 12 })
        .then(d => { if (alive) setCatalog(d); })
        .catch(() => { if (alive) setError('The catalog could not be loaded. Please try again.'); })
        .finally(() => { if (alive) setLoadingCatalog(false); });
    }
    return () => { alive = false; };
  }, [q, category, sort, page, available, isCatalog, showSaved, catalogRetry]);
  useEffect(() => {
    if (isProduct && slug) {
      setProduct(null); setRelated([]); setProductLoadFailed(false);
      storeApi.product(slug).then(p => {
        setProduct(p);
        updateRecent(l => [p, ...l.filter(x => x.id !== p.id)].slice(0, 8));
        storeApi.products({ search: '', category: p.category_id, sort: 'recommended', page: 1, available: false, limit: 5 })
          .then(d => setRelated(d.items.filter((x: StoreProduct) => x.id !== p.id).slice(0, 4))).catch(() => setRelated([]));
      }).catch(() => { setError('This product could not be found.'); setProductLoadFailed(true); });
    }
  }, [slug, isProduct, updateRecent]);
  useEffect(() => {
    const needsRefresh = (item: StoreProduct): boolean => Boolean(item.image && (
      item.image.startsWith('/uploads/store/') ||
      (item.image.startsWith('/store-assets/') && !item.image.startsWith(`/store-assets/${item.category_id}/`))
    ));
    if (!recent.some(needsRefresh)) return;

    let cancelled = false;
    Promise.all(recent.map(item => needsRefresh(item)
      ? storeApi.product(item.slug).catch(() => null)
      : Promise.resolve(item)))
      .then(items => {
        if (cancelled) return;
        updateRecent(() => items.filter((item): item is StoreProduct => item !== null));
      });
    return () => { cancelled = true; };
  }, [recent, updateRecent]);
  useEffect(() => { if (isOrders) storeApi.orders().then(setOrders).catch(() => setError('Your orders could not be loaded.')); }, [isOrders]);
  useEffect(() => { if (orderId && orderId !== 'undefined') storeApi.order(orderId).then(setOrder).catch(() => setError('Order not found.')); }, [orderId]);

  /* ui effects */
  useEffect(() => { window.scrollTo({ top: 0 }); setDrawer(false); }, [path]);
  useEffect(() => { setSearchText(q); }, [q]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(''), 2400); return () => window.clearTimeout(t); }, [toast]);
  useEffect(() => { if (!count) return; setBump(true); const t = window.setTimeout(() => setBump(false), 350); return () => window.clearTimeout(t); }, [count]);
  useEffect(() => { // debounce search typing
    if (searchText === q) return;
    const t = window.setTimeout(() => setFilter('q', searchText.trim()), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams); if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page'); if (key !== 'saved' && value) next.delete('saved');
    setSearchParams(next);
  };
  const toggleSaved = (p: StoreProduct) => {
    const was = isSaved(p);
    updateSaved(l => was ? l.filter(x => x.id !== p.id) : [p, ...l]);
    setToast(was ? 'Removed from saved' : 'Saved for later');
  };

  /* cart actions */
  const addToCart = async (p: StoreProduct, qty = 1, openDrawer = true, variantId?: string): Promise<boolean> => {
    const selected = p.variants?.find(v => v.id === variantId);
    const availableStock = selected?.stock_quantity ?? p.stock_quantity;
    if (p.variants?.length && !variantId) { setError('Choose a product option first.'); return false; }
    if (p.variants?.length && !selected) { setError('That product option is no longer available.'); return false; }
    if (!availableStock) { setError('This item is sold out.'); return false; }
    setBusyId(p.id); setError('');
    try {
      const unitPrice = selected?.price_paise ?? p.price_paise;
      if (authenticated) setCart(await storeApi.add(p.id, qty, variantId));
      else {
        const existing = readGuest(); const found = existing.items.find(i => i.product.id === p.id && i.variant_id === variantId);
        if ((found?.quantity || 0) + qty > availableStock) throw new Error('That is the maximum available quantity.');
        const next = found
          ? { ...existing, items: existing.items.map(i => i.item_id === found.item_id ? { ...i, quantity: i.quantity + qty, line_total_paise: (i.quantity + qty) * i.unit_price_paise } : i) }
          : { ...existing, items: [...existing.items, { item_id: createIdempotencyKey(), product: p, quantity: qty, variant_id: variantId, variant_name: selected?.name, unit_price_paise: unitPrice, line_total_paise: unitPrice * qty, available: true }] };
        const done = recalc(next); writeGuest(done); setCart(done);
      }
      setToast(`${p.name} added to your bag`); if (openDrawer) setDrawer(true);
      return true;
    } catch (e: any) { setError(e.response?.data?.detail || e.message || 'Could not add item to bag.'); return false; }
    finally { setBusyId(null); }
  };
  const updateQty = async (itemId: string, qty: number) => {
    try {
      if (authenticated) setCart(await storeApi.change(itemId, qty));
      else { const g = readGuest(); const done = recalc({ ...g, items: g.items.map(i => i.item_id === itemId ? { ...i, quantity: qty, line_total_paise: i.unit_price_paise * qty } : i) }); writeGuest(done); setCart(done); }
    } catch (e: any) { setError(e.response?.data?.detail || 'Could not update the bag.'); }
  };
  const remove = async (itemId: string) => {
    try {
      if (authenticated) setCart(await storeApi.remove(itemId));
      else { const g = readGuest(); const done = recalc({ ...g, items: g.items.filter(i => i.item_id !== itemId) }); writeGuest(done); setCart(done); }
    } catch (e: any) { setError(e.response?.data?.detail || 'Could not remove the item.'); }
  };
  const goCheckout = () => {
    setDrawer(false);
    if (!authenticated) { setError('Sign in to continue to checkout. Your guest bag is saved on this device.'); navigate('/auth/login'); }
    else navigate('/store/checkout');
  };

  const heading = isProduct ? product?.name || 'Product' : isCart ? 'Your bag' : isCheckout ? 'Checkout' : isOrders || orderId ? 'Orders' : isAdmin ? 'Manage' : showSaved ? 'Saved' : category ? categoryLabel(categories, category) : 'Shop';
  const landing = isCatalog && !q && !category && page === 1 && !showSaved && !available;
  const list = showSaved ? saved : catalog.items;
  const card = (p: StoreProduct, className = '') => <ProductCard key={p.id} className={className} product={p} categories={categories} onAdd={x => addToCart(x)} onBuy={async x => { if (await addToCart(x, 1, false)) goCheckout(); }} onQuick={setQuick} saved={isSaved(p)} onSave={toggleSaved} busy={busyId === p.id} />;
  const categoryNavigation = !showSaved && categories.length > 0 && <div className="mb-6">
    <p className="mb-2 text-[10px] font-semibold uppercase tracking-[.15em] text-text-muted">Shop by category</p>
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Shop by category">
      <button onClick={() => setFilter('category', '')} aria-pressed={!category} className={`min-h-10 flex-none rounded-full border px-4 text-xs font-semibold transition ${!category ? 'border-brand bg-brand text-white' : 'border-white/10 text-text-secondary hover:border-white/30'}`}>All</button>
      {categories.map(c => <button key={c.id} onClick={() => setFilter('category', category === c.slug ? '' : c.slug)} aria-pressed={category === c.slug} className={`min-h-10 flex-none whitespace-nowrap rounded-full border px-4 text-xs font-semibold transition ${category === c.slug ? 'border-brand bg-brand text-white' : 'border-white/10 text-text-secondary hover:border-white/30'}`}>{c.name}</button>)}
    </div>
  </div>;
  const activeFilters = [
    q && { k: 'q', label: `â€œ${q}â€` }, category && { k: 'category', label: categoryLabel(categories, category) },
    available && { k: 'available', label: 'In stock' }, sort !== 'recommended' && { k: 'sort', label: 'Sorted' },
  ].filter(Boolean) as { k: string; label: string }[];

  const navItem = (to: string, label: string, icon: React.ReactNode, active: boolean) =>
    <Link to={to} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${active ? 'text-brand-light' : 'text-text-muted'}`} aria-current={active ? 'page' : undefined}>{icon}{label}</Link>;

  return <div className="mx-auto max-w-[1450px] px-4 pb-28 text-text-primary sm:px-6 md:pb-10">
    {/* header */}
    <header className="sticky top-0 z-30 -mx-4 mb-5 flex items-center justify-between gap-3 border-b border-white/[.07] bg-[#0a0a0d]/95 px-4 py-2.5 sm:-mx-6 sm:px-6">
      <Link to={brandHome} aria-label={user?.is_admin ? 'Fortis admin dashboard' : authenticated ? 'Fortis user dashboard' : 'Fortis Store'} className="flex items-center gap-2.5">
        <img src="/fortis-mark.png" alt="FORTIS" className="h-10 w-10 object-contain" />
        <span className="leading-tight"><b className="block text-sm tracking-[.14em]">FORTIS <span className="text-brand-light">STORE</span></b><small className="hidden text-[10px] text-text-muted sm:block">Train better. Choose smarter.</small></span>
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2" aria-label="Store">
        <Link to="/store?saved=1" className="relative hidden h-10 items-center gap-1.5 rounded-lg px-3 text-xs text-text-secondary hover:bg-white/5 hover:text-white md:flex"><Heart size={15} /> Saved{saved.length > 0 && <span className="rounded-full bg-white/10 px-1.5 text-[10px]">{saved.length}</span>}</Link>
        <Link to="/store/orders" className="hidden h-10 items-center rounded-lg px-3 text-xs text-text-secondary hover:bg-white/5 hover:text-white md:flex">Orders</Link>
        {user?.is_admin && <Link to="/admin/dashboard" className="hidden h-10 items-center rounded-lg px-3 text-xs text-text-secondary hover:bg-white/5 hover:text-white md:flex">Manage</Link>}
        {!user?.is_admin && <Link to="/auth/login" className="hidden h-10 items-center rounded-lg px-3 text-xs text-text-secondary hover:bg-white/5 hover:text-white md:flex">Admin</Link>}
        <button onClick={() => setDrawer(true)} aria-label={`Open bag, ${count} items`} className="flex h-10 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-sm font-semibold transition hover:border-brand/60">
          <ShoppingBag size={16} /> <span className="hidden sm:inline">Bag</span>
          <span className={`grid min-w-[20px] place-items-center rounded-full bg-brand px-1.5 text-[11px] text-white transition-transform duration-300 ${bump ? 'scale-125' : ''}`}>{count}</span>
        </button>
        {user && <Link to={brandHome} className="hidden max-w-[120px] truncate text-xs text-text-muted hover:text-white lg:inline">{user.name}</Link>}
      </nav>
    </header>

    {/* alerts */}
    {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300"><CircleAlert size={16} className="mt-0.5 flex-none" /><span>{error}</span><button className="ml-auto flex-none underline" onClick={() => setError('')}>Dismiss</button></div>}

    {/* breadcrumb */}
    {!landing && <div className="mb-5 flex min-w-0 items-center gap-2 text-xs text-text-muted"><Link to="/store" className="flex items-center gap-1 hover:text-white"><Home size={12} /> Store</Link><span>/</span><span className="truncate text-text-secondary">{heading}</span></div>}

    {isAdmin && <StoreAdmin categories={categories} user={user} setError={setError} setNotice={setToast} />}

    {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
    {isCatalog && <>
      {landing && <>
        <section className="mb-6 border-b border-white/[.08] pb-6 pt-3 sm:pb-8 sm:pt-7">
          <p className="text-[10px] font-bold tracking-[.2em] text-brand-light">EQUIP YOUR POTENTIAL</p>
          <div className="mt-2 max-w-3xl">
              <h1 className="text-3xl font-black leading-[1.02] tracking-tight sm:text-5xl">BUILD YOUR <span className="text-brand-light">STRONGER SELF.</span></h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-text-secondary sm:text-base">Training essentials, fitness equipment, and recovery products selected for your journey.</p>
          </div>
        </section>

        <ul className="mb-7 grid gap-2 text-xs text-text-secondary sm:grid-cols-3">
          {[[ShieldCheck, 'Price and stock checks at checkout.'], [Truck, 'Shipping details shown before payment.'], [Package, 'Your bag stays saved on this device.']].map(([Icon, text]: any) =>
            <li key={text} className="flex items-center gap-2.5 border-l-2 border-brand/70 bg-white/[.02] px-3 py-2.5"><Icon size={15} className="flex-none text-brand-light" />{text}</li>)}
        </ul>

        {categoryNavigation}
        {featuredLoaded && <Rail title="Featured picks" subtitle={featuredProducts.length ? 'Selected by the Fortis team' : undefined}>{featuredProducts.length ? featuredProducts.map(p => card(p, 'w-[44vw] max-w-[230px] flex-none snap-start sm:w-[220px]')) : <p className="w-full rounded-lg border border-white/[.08] px-4 py-5 text-sm text-text-muted">New featured gear is being curated.</p>}</Rail>}
        {recent.length > 0 && <Rail title="Recently viewed">{recent.slice(0, 8).map(p => card(p, 'w-[44vw] max-w-[230px] flex-none snap-start sm:w-[220px]'))}</Rail>}
      </>}

      {!landing && categoryNavigation}

      <section id="catalog" className="scroll-mt-20">
        {catalog.items.some(p => p.demo_only) && <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-5 text-amber-100">Sample training gear for preview only. Listings have no verified prices or inventory and cannot be purchased. Replace these with verified catalog data before selling.</p>}
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{showSaved ? 'Saved for later' : q ? `Results for â€œ${q}â€` : category ? categoryLabel(categories, category) : 'All gear'}</h2>
            <p className="mt-0.5 text-xs text-text-muted" aria-live="polite">{showSaved ? `${saved.length} saved on this device` : loadingCatalog ? 'Loadingâ€¦' : `${catalog.total} ${catalog.total === 1 ? 'product' : 'products'}`}</p>
          </div>
          {!showSaved && <label className="relative w-full sm:w-80"><Search size={15} className="absolute left-3 top-3 text-text-muted" /><input className="fortis-input h-10 w-full pl-9 text-sm" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search name, brand, tags, size" aria-label="Search products" />{searchText && <button type="button" onClick={() => { setSearchText(''); setFilter('q', ''); }} aria-label="Clear search" className="absolute right-2 top-2 grid h-6 w-6 place-items-center text-text-muted"><X size={14} /></button>}</label>}
        </div>

        {!showSaved && <div className="sticky top-[61px] z-20 -mx-4 mb-5 border-y border-white/[.06] bg-[#0a0a0d]/95 px-4 py-2.5 sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <span className="hidden text-xs text-text-muted sm:block">Refine your results</span>
            <div className="hidden items-center gap-2 sm:flex">
              <button onClick={() => setFilter('available', available ? '' : 'true')} aria-pressed={available} className={`flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium ${available ? 'border-brand text-brand-light' : 'border-white/10 text-text-secondary hover:border-white/25'}`}><SlidersHorizontal size={13} /> In stock</button>
              <select className="fortis-input h-9 w-auto min-w-40 py-0 text-xs" value={sort} onChange={e => setFilter('sort', e.target.value)} aria-label="Sort products">
                <option value="recommended">Recommended</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="newest">Newest first</option><option value="name">Name, Aâ€“Z</option>
              </select>
            </div>
            <button onClick={() => setShowMobileFilters(open => !open)} aria-expanded={showMobileFilters} className="flex h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold text-text-secondary sm:hidden"><SlidersHorizontal size={14} /> Filters{(available || sort !== 'recommended') && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}</button>
            <label className="flex items-center gap-2 text-xs text-text-secondary sm:hidden"><span>Sort</span><select className="fortis-input h-10 w-auto max-w-[190px] py-0 text-xs" value={sort} onChange={e => setFilter('sort', e.target.value)} aria-label="Sort products"><option value="recommended">Recommended</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option><option value="newest">Newest first</option><option value="name">Name, Aâ€“Z</option></select></label>
          </div>
          {showMobileFilters && <div className="mt-2 flex items-center justify-between border-t border-white/[.06] pt-2 sm:hidden"><span className="text-xs text-text-secondary">Availability</span><button onClick={() => setFilter('available', available ? '' : 'true')} aria-pressed={available} className={`rounded-lg border px-3 py-2 text-xs font-medium ${available ? 'border-brand bg-brand/10 text-brand-light' : 'border-white/10 text-text-secondary'}`}>{available ? 'In stock only' : 'All items'}</button></div>}
        </div>}

        {activeFilters.length > 0 && !showSaved && <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
          {activeFilters.map(f => <button key={f.k} onClick={() => setFilter(f.k, '')} className="flex items-center gap-1 rounded-full bg-white/[.07] px-3 py-1.5 hover:bg-white/10">{f.label}<X size={12} /></button>)}
          <button onClick={() => setSearchParams({})} className="text-brand-light underline">Clear all</button>
        </div>}

        {loadingCatalog && !showSaved ? <ProductSkeletons />
          : list.length ? <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:gap-x-6 2xl:grid-cols-5">{list.map(p => card(p))}</div>
            : <div className="rounded-2xl border border-white/[.07] bg-white/[.02] px-5 py-16 text-center">
              {showSaved ? <Heart className="mx-auto mb-3 h-8 w-8 text-text-muted" /> : <Package className="mx-auto mb-3 h-8 w-8 text-text-muted" />}
              <h3 className="font-semibold">{showSaved ? 'Nothing saved yet' : error ? 'Catalog unavailable' : 'No gear matches this search'}</h3>
              <p className="mt-1 text-sm text-text-muted">{showSaved ? 'Tap the heart on any product to keep it here.' : error ? 'Please refresh or try again shortly.' : 'Try another keyword or clear your filters.'}</p>
              <button onClick={() => error ? setCatalogRetry(retry => retry + 1) : setSearchParams({})} className="mt-4 text-sm font-semibold text-brand-light">{showSaved ? 'Browse the store' : error ? 'Try again' : 'Clear filters'}</button>
            </div>}

        {!showSaved && catalog.pages > 1 && <div className="mt-10 flex items-center justify-center gap-4">
          <button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))} className="fortis-btn-secondary disabled:opacity-40">Previous</button>
          <span className="text-xs text-text-muted">Page {page} of {catalog.pages}</span>
          <button disabled={page >= catalog.pages} onClick={() => setFilter('page', String(page + 1))} className="fortis-btn-secondary disabled:opacity-40">Next</button>
        </div>}
      </section>
    </>}

    {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ product detail â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
    {isProduct && (product ? <ProductDetail product={product} categories={categories} related={related} recent={recent.filter(r => r.id !== product.id)} busy={busyId === product.id} saved={isSaved(product)} onSave={toggleSaved}
      onAdd={(qty, variantId) => addToCart(product, qty, true, variantId)} onBuy={async (qty, variantId) => { if (await addToCart(product, qty, false, variantId)) goCheckout(); }} setToast={setToast} card={card} />
      : productLoadFailed ? <div className="rounded-xl border border-white/[.08] py-16 text-center"><Package className="mx-auto mb-3 h-9 w-9 text-text-muted"/><h1 className="font-semibold">Product unavailable</h1><p className="mt-1 text-sm text-text-muted">This product may have been removed from the catalog.</p><Link to="/store" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-brand-light">Back to shop <ArrowRight size={14}/></Link></div>
        : <div className="grid gap-8 lg:grid-cols-2"><Skeleton className="aspect-square !rounded-3xl" /><div className="space-y-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-3/4" /><Skeleton className="h-8 w-32" /><Skeleton className="h-32 w-full" /></div></div>)}

    {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ bag page â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
    {isCart && <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section>
        <h1 className="mb-6 text-2xl font-bold">Your bag <span className="text-sm font-normal text-text-muted">({count} {count === 1 ? 'item' : 'items'})</span></h1>
        {cart.items.length === 0
          ? <div className="rounded-2xl border border-white/[.07] py-16 text-center"><ShoppingBag className="mx-auto h-9 w-9 text-text-muted" /><p className="mt-4 font-semibold">Your bag is ready for something good.</p><Link to="/store" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-brand-light">Continue shopping <ArrowRight size={15} /></Link></div>
          : <ul className="divide-y divide-white/[.07]">{cart.items.map(i => <li key={i.item_id} className="flex gap-4 py-5">
            <Link to={`/store/product/${i.product.slug}`} className="h-24 w-24 flex-none overflow-hidden rounded-xl bg-dark-card">{i.product.image ? <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" /> : <Package className="m-8 text-text-muted" />}</Link>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between gap-3"><span><Link to={`/store/product/${i.product.slug}`} className="font-semibold hover:text-brand-light">{i.product.name}</Link>{i.variant_name && <small className="mt-1 block text-text-muted">{i.variant_name}</small>}</span><b className="flex-none">{inr(i.line_total_paise)}</b></div>
              <p className="mt-1 text-sm text-text-secondary">{inr(i.unit_price_paise)} each</p>
              <p className={`mt-1 text-xs ${i.available ? 'text-emerald-300' : 'text-amber-300'}`}>{i.available ? 'In stock' : 'Availability changed'}</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex items-center rounded-lg border border-white/10">
                  <button aria-label="Decrease quantity" onClick={() => i.quantity > 1 ? updateQty(i.item_id, i.quantity - 1) : remove(i.item_id)} className="grid h-9 w-9 place-items-center"><Minus size={14} /></button>
                  <span className="w-7 text-center text-sm font-semibold">{i.quantity}</span>
                  <button aria-label="Increase quantity" onClick={() => updateQty(i.item_id, i.quantity + 1)} disabled={i.quantity >= (i.variant_stock_quantity ?? i.product.stock_quantity)} className="grid h-9 w-9 place-items-center disabled:opacity-30"><Plus size={14} /></button>
                </div>
                <button onClick={() => remove(i.item_id)} className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-red-300"><Trash2 size={13} /> Remove</button>
              </div>
            </div>
          </li>)}</ul>}
      </section>
      <aside className="h-fit rounded-2xl border border-white/[.08] bg-white/[.025] p-5 lg:sticky lg:top-24">
        <h2 className="font-bold">Order summary</h2>
        <div className="mt-5 flex justify-between text-sm text-text-secondary"><span>Subtotal</span><span>{inr(cart.subtotal_paise)}</span></div>
        <div className="mt-3 flex justify-between text-sm text-text-secondary"><span>Shipping</span><span>Not configured</span></div>
        <div className="my-5 border-t border-white/10" />
        <div className="flex justify-between font-bold"><span>Items total</span><span>{inr(cart.total_paise)}</span></div>
        <button onClick={goCheckout} disabled={!cart.items.length} className="fortis-btn-primary mt-5 w-full">Continue to checkout</button>
        <p className="mt-3 text-center text-[11px] text-text-muted">Shipping and applicable taxes are not configured. No payment will be collected.</p>
      </aside>
    </div>}

    {isCheckout && <Checkout cart={cart} setError={setError} setPreview={setPreview} preview={preview} navigate={navigate} authenticated={authenticated} defaultName={user?.name || ''} />}

    {/* â”€â”€â”€â”€â”€â”€â”€â”€â”€ orders â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
    {isOrders && !orderId && <section className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-2xl font-bold">Your orders</h1>
      {orders.length ? <div className="space-y-3">{orders.map(o => <Link key={o.id} to={`/store/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.08] p-4 transition hover:border-brand/40">
        <div><b>{o.order_number}</b><p className="mt-1 text-xs text-text-muted">{new Date(o.created_at).toLocaleDateString('en-IN')} Â· {o.items?.length || 0} {(o.items?.length || 0) === 1 ? 'product' : 'products'}</p></div>
        <div className="text-right"><b>{inr(o.grand_total_paise)}</b><div className="mt-1.5 flex justify-end gap-1.5 text-[11px]"><span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300">{String(o.payment_status).replace('_', ' ')}</span><span className="rounded-full bg-white/[.07] px-2 py-0.5 text-text-secondary">{String(o.order_status || '').replace('_', ' ')}</span></div></div>
      </Link>)}</div>
        : <div className="rounded-2xl border border-white/[.07] py-14 text-center text-sm text-text-muted">No orders yet. Your next training essential is waiting.<div><Link to="/store" className="mt-3 inline-block font-semibold text-brand-light">Start shopping</Link></div></div>}
    </section>}
    {orderId && <OrderConfirmation order={order} error={error} setToast={setToast} />}

    {/* overlays */}
    <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} count={count} onQty={updateQty} onRemove={remove} onCheckout={goCheckout} />
    <QuickView product={quick} categories={categories} onClose={() => setQuick(null)} onAdd={p => addToCart(p)} busy={!!quick && busyId === quick.id} />
    <div role="status" aria-live="polite" className={`pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex justify-center px-4 transition-all duration-300 md:bottom-8 ${toast ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}>
      {toast && <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1b1b22] px-4 py-2.5 text-sm shadow-2xl"><Check size={15} className="text-emerald-400" />{toast}</div>}
    </div>

    {/* mobile bottom nav */}
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/[.08] bg-[#0a0a0d]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Store navigation">
      {navItem('/store', 'Shop', <Home size={19} />, path === '/store' && !showSaved)}
      {navItem('/store?saved=1', 'Saved', <Heart size={19} />, showSaved)}
      <button onClick={() => setDrawer(true)} className="relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-text-muted"><ShoppingBag size={19} />Bag{count > 0 && <span className="absolute right-[calc(50%-18px)] top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] text-white">{count}</span>}</button>
      {navItem('/store/orders', 'Orders', <Package size={19} />, isOrders || !!orderId)}
    </nav>
  </div>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ product detail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function ProductDetail({ product, categories, related, recent, busy, saved, onSave, onAdd, onBuy, setToast, card }: {
  product: StoreProduct; categories: StoreCategory[]; related: StoreProduct[]; recent: StoreProduct[]; busy: boolean; saved: boolean;
  onSave: (p: StoreProduct) => void; onAdd: (qty: number, variantId?: string) => void; onBuy: (qty: number, variantId?: string) => void; setToast: (s: string) => void; card: (p: StoreProduct, c?: string) => React.ReactNode;
}) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState('');
  useEffect(() => { setQty(1); setVariantId(''); }, [product.id, product.variants]);
  const selectedVariant = product.variants?.find(v => v.id === variantId);
  const currentStock = selectedVariant?.stock_quantity ?? (product.variants?.length ? 0 : product.stock_quantity);
  const currentPrice = selectedVariant?.price_paise ?? product.price_paise;
  const stock = stockInfo(currentStock); const max = Math.max(currentStock, 1);
  const specs = product.specifications ? Object.entries(product.specifications) : [];
  const share = async () => {
    const url = window.location.href;
    try { if (navigator.share) await navigator.share({ title: product.name, url }); else { await navigator.clipboard.writeText(url); setToast('Link copied'); } } catch { /* cancelled */ }
  };
  const Acc = ({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) =>
    <details open={open} className="group border-b border-white/[.08] py-4"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">{title}<ChevronDown size={16} className="transition group-open:rotate-180" /></summary><div className="mt-3 text-sm leading-6 text-text-secondary">{children}</div></details>;

  return <>
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-14">
      <div className="relative aspect-square overflow-hidden rounded-3xl bg-dark-card">
        {product.image ? <img src={productImageSrc(product.image)} alt={product.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center bg-radial-orange"><Package className="h-20 w-20 text-white/20" /></div>}
        <div className="absolute right-3 top-3 flex flex-col gap-2">
          <button onClick={() => onSave(product)} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save for later'} className="grid h-11 w-11 place-items-center rounded-full bg-black/60 backdrop-blur active:scale-90"><Heart size={18} className={saved ? 'fill-brand text-brand' : ''} /></button>
          <button onClick={share} aria-label="Share product" className="grid h-11 w-11 place-items-center rounded-full bg-black/60 backdrop-blur active:scale-90"><Share2 size={18} /></button>
        </div>
      </div>
      <div className="flex flex-col">
        <p className="text-xs text-text-muted">{categoryLabel(categories, product.category_id)}</p>
        <h1 className="mt-1.5 text-3xl font-black leading-tight sm:text-4xl">{product.name}</h1>
        {(product.brand || product.sku) && <p className="mt-2 text-sm text-text-muted">{product.brand}{product.brand && product.sku ? ' Â· ' : ''}{product.sku && `SKU ${product.sku}`}</p>}
        {product.variants?.length ? <label className="mt-5 block text-xs font-semibold text-white/60">Choose an option<select value={variantId} onChange={e => {setVariantId(e.target.value);setQty(1)}} className="fortis-input mt-1"><option value="">Select option</option>{product.variants.map(v=><option key={v.id} value={v.id} disabled={!v.stock_quantity}>{v.name} · {v.stock_quantity ? `${v.stock_quantity} available` : 'Unavailable'}</option>)}</select></label> : null}
        <p className="mt-5 text-3xl font-bold">{product.variants?.length && !selectedVariant ? `From ${inr(product.price_paise)}` : inr(currentPrice)}</p>
        <p className="mt-1 text-[11px] text-text-muted">Shipping and taxes are not configured yet.</p>
        {product.variants?.length && !selectedVariant ? <p className="mt-3 text-sm text-text-muted">Select an option to see availability.</p> : currentStock > 0 ? <div className="mt-3 flex items-center gap-2 text-sm"><span className={`h-2 w-2 rounded-full ${stock.dot}`} /><span className={stock.text}>{stock.label}</span>{selectedVariant && <span className="text-xs text-white/45">{Object.entries(selectedVariant.attributes || {}).map(([k,v])=>`${k}: ${v}`).join(' · ')}</span>}</div> : null}

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center rounded-xl border border-white/10">
            <button aria-label="Decrease quantity" onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1} className="grid h-12 w-12 place-items-center disabled:opacity-30"><Minus size={16} /></button>
            <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
            <button aria-label="Increase quantity" onClick={() => setQty(q => Math.min(max, q + 1))} disabled={qty >= max || !currentStock} className="grid h-12 w-12 place-items-center disabled:opacity-30"><Plus size={16} /></button>
          </div>
          {!product.demo_only && <p className="text-sm text-text-secondary">Total <b className="text-white">{inr(currentPrice * qty)}</b></p>}
        </div>
        <div className="mt-4 hidden gap-3 sm:flex">
          <button disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)} onClick={() => onAdd(qty, variantId || undefined)} className="fortis-btn-primary flex-1">{busy ? 'Adding...' : 'Add to bag'}</button>
          <button onClick={() => onBuy(qty, variantId || undefined)} disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)} className="fortis-btn-secondary">Buy now</button>
        </div>

        <div className="mt-8">
          <Acc title="Description" open><p className="whitespace-pre-line">{product.description || 'Product details will be available soon.'}</p></Acc>
          {specs.length > 0 && <Acc title="Specifications"><dl className="grid grid-cols-2 gap-2">{specs.map(([k, v]) => <div key={k} className="rounded-xl bg-white/[.035] p-3"><dt className="text-[11px] text-text-muted">{k}</dt><dd className="mt-0.5 text-sm text-white">{String(v)}</dd></div>)}</dl></Acc>}
          <Acc title="Delivery and payment"><p>Shipping and taxes are not configured yet. Payment is not configured: orders stay unpaid until a payment gateway is connected, and you are not charged. Price and stock are verified when you place the order.</p></Acc>
        </div>
      </div>
    </div>

    {related.length > 0 && <div className="mt-14"><Rail title="You may also like" subtitle={`More from ${categoryLabel(categories, product.category_id)}`}>{related.map(p => card(p, 'w-[44vw] max-w-[230px] flex-none snap-start sm:w-[220px]'))}</Rail></div>}
    {recent.length > 0 && <Rail title="Recently viewed">{recent.slice(0, 6).map(p => card(p, 'w-[44vw] max-w-[230px] flex-none snap-start sm:w-[220px]'))}</Rail>}

    {/* sticky mobile buy bar */}
    {!product.demo_only && <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex items-center gap-2 border-t border-white/[.08] bg-[#0a0a0d]/95 px-4 py-3 backdrop-blur-xl sm:hidden">
      <div className="min-w-0"><p className="truncate text-[11px] text-text-muted">{product.name}</p><b>{inr(currentPrice * qty)}</b></div>
      <button disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)} onClick={() => onAdd(qty, variantId || undefined)} className="fortis-btn-secondary ml-auto flex-none px-3">Add</button>
      <button disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)} onClick={() => onBuy(qty, variantId || undefined)} className="fortis-btn-primary flex-none px-3">Buy now</button>
    </div>}
  </>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ checkout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

const FIELDS: { key: string; label: string; type?: string; mode?: 'numeric' | 'tel'; span?: boolean; optional?: boolean; auto: string }[] = [
  { key: 'name', label: 'Full name', auto: 'name' },
  { key: 'phone', label: 'Phone number', type: 'tel', mode: 'tel', auto: 'tel' },
  { key: 'line1', label: 'Address line 1', span: true, auto: 'address-line1' },
  { key: 'line2', label: 'Address line 2 (optional)', span: true, optional: true, auto: 'address-line2' },
  { key: 'city', label: 'City', auto: 'address-level2' },
  { key: 'state', label: 'State', auto: 'address-level1' },
  { key: 'postal_code', label: 'PIN code', mode: 'numeric', auto: 'postal-code' },
];
const validate = (k: string, v: string) => {
  if (k === 'phone' && !/^\d{10}$/.test(v.replace(/\s|\+91|-/g, ''))) return 'Enter a 10-digit mobile number.';
  if (k === 'postal_code' && !/^\d{6}$/.test(v)) return 'Enter a 6-digit PIN code.';
  return '';
};

function Checkout({ cart, setError, setPreview, preview, navigate, authenticated, defaultName }: {
  cart: CartSummary; setError: (s: string) => void; setPreview: (o: any) => void; preview: any; navigate: (to: string) => void; authenticated: boolean; defaultName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<Record<string, string>>({ name: defaultName, phone: '', line1: '', line2: '', city: '', state: '', postal_code: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showItems, setShowItems] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);
  useEffect(() => { if (authenticated) storeApi.preview().then(setPreview).catch(e => setError(e.response?.data?.detail || 'Could not calculate checkout total.')); }, [authenticated]);
  const change = (e: ChangeEvent<HTMLInputElement>) => setAddress({ ...address, [e.target.name]: e.target.value });
  const errors = Object.fromEntries(FIELDS.map(f => [f.key, validate(f.key, address[f.key])]));
  const valid = FIELDS.every(f => (f.optional || address[f.key].trim()) && !errors[f.key]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setTouched(Object.fromEntries(FIELDS.map(f => [f.key, true]))); if (!valid) return;
    setLoading(true); setError('');
    try { const o = await storeApi.checkout(address, idempotencyKey); navigate(`/store/orders/${o.id}`); }
    catch (err: any) { setError(err.response?.data?.detail || 'Could not place order. Please review your details.'); }
    finally { setLoading(false); }
  };
  if (!authenticated) return <div className="py-16 text-center"><h1 className="text-2xl font-bold">Sign in to checkout</h1><p className="mt-2 text-sm text-text-muted">Your bag stays saved on this device.</p><Link to="/auth/login" className="fortis-btn-primary mt-5 inline-block">Sign in</Link></div>;
  const total = preview?.total_paise ?? cart.total_paise;

  return <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
    <form onSubmit={submit} noValidate className="space-y-6">
      <ol className="flex items-center gap-2 text-xs" aria-label="Checkout progress">
        {['Bag', 'Delivery', 'Review'].map((s, i) => <li key={s} className="flex items-center gap-2"><span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${i < 2 ? 'bg-brand text-white' : 'bg-white/10 text-text-muted'}`}>{i === 0 ? <Check size={12} /> : i + 1}</span><span className={i === 1 ? 'font-semibold text-white' : 'text-text-muted'}>{s}</span>{i < 2 && <span className="h-px w-6 bg-white/15 sm:w-10" />}</li>)}
      </ol>
      <div><h1 className="text-2xl font-bold">Delivery details</h1><p className="mt-1 text-sm text-text-muted">Where should we send your training gear?</p></div>
      <div className="grid gap-4 sm:grid-cols-2">{FIELDS.map(f => {
        const err = touched[f.key] ? (f.optional ? '' : !address[f.key].trim() ? 'This field is required.' : errors[f.key]) : '';
        return <label key={f.key} className={`fortis-label ${f.span ? 'sm:col-span-2' : ''}`}>{f.label}
          <input name={f.key} value={address[f.key]} onChange={change} onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))} type={f.type || 'text'} inputMode={f.mode} autoComplete={f.auto}
            aria-invalid={!!err} className={`fortis-input mt-1 h-12 text-base sm:h-11 sm:text-sm ${err ? '!border-red-500/60' : ''}`} />
          {err && <span className="mt-1 block text-xs text-red-300">{err}</span>}
        </label>;
      })}</div>
      <button disabled={loading || !cart.items.length} className="fortis-btn-primary w-full sm:w-auto">{loading ? 'Placing orderâ€¦' : 'Place unpaid order'}</button>
    </form>

    <aside className="h-fit rounded-2xl border border-white/[.08] bg-white/[.025] p-5 lg:sticky lg:top-24">
      <h2 className="font-bold">Order review</h2>
      <button type="button" onClick={() => setShowItems(s => !s)} className="mt-3 flex w-full items-center justify-between text-sm text-text-secondary lg:hidden" aria-expanded={showItems}>{cart.items.length} items<ChevronDown size={15} className={`transition ${showItems ? 'rotate-180' : ''}`} /></button>
      <div className={`${showItems ? 'block' : 'hidden'} lg:block`}>{cart.items.map(i => <div key={i.item_id} className="mt-3 flex items-center gap-3 text-sm">
        <div className="h-12 w-12 flex-none overflow-hidden rounded-lg bg-dark-card">{i.product.image && <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" />}</div>
        <span className="min-w-0 flex-1 truncate text-text-secondary">{i.product.name}{i.variant_name ? ` · ${i.variant_name}` : ''} × {i.quantity}</span><span>{inr(i.line_total_paise)}</span></div>)}</div>
      <div className="my-4 border-t border-white/10" />
      <div className="flex justify-between text-sm text-text-secondary"><span>Subtotal</span><span>{inr(preview?.subtotal_paise ?? cart.subtotal_paise)}</span></div>
      <div className="mt-2 flex justify-between text-sm text-text-secondary"><span>Shipping and taxes</span><span>Not configured</span></div>
      <div className="my-4 border-t border-white/10" />
      <div className="flex justify-between font-bold"><span>Items total</span><span>{inr(total)}</span></div>
      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100"><CircleAlert size={14} className="mr-1 inline" />No payment provider is configured. This creates an unpaid order and does not charge you.</div>
      <p className="mt-3 text-[11px] text-text-muted">{preview?.message || 'The server verifies product price and stock when the order is placed.'}</p>
    </aside>
  </div>;
}

/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

export function StoreAdmin({ categories, user, setError, setNotice }: { categories: StoreCategory[]; user: any; setError: (s: string) => void; setNotice: (s: string) => void }) {
  const navigate = useNavigate(); const { productId } = useParams(); const location = useLocation();
  const emptyProduct = { name: '', brand: '', category_id: '', description: '', image: '', price: '', stock_quantity: '', sku: '', tags: '', specifications: '{}', variants: '[]', featured: false, active: true, demo_only: false };
  const [categoryName, setCategoryName] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<StoreCategory[]>(categories);
  const [product, setProduct] = useState(emptyProduct);
  const [editingId, setEditingId] = useState('');
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productPage, setProductPage] = useState(1);
  const [productPages, setProductPages] = useState(1);
  const [productTotal, setProductTotal] = useState(0);
  const [productSearch, setProductSearch] = useState('');
  const [productStatus, setProductStatus] = useState('all');
  const [productStock, setProductStock] = useState('all');
  const [productCategory, setProductCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setCategoryOptions(categories); }, [categories]);
  const loadProducts = useCallback(async () => {
    if (!user?.is_admin) return;
    try {
      const result = await storeApi.adminProducts({ search: productSearch, status: productStatus, stock: productStock, category: productCategory, page: productPage, limit: 20 });
      setProducts(result.items); setProductPages(result.pages); setProductTotal(result.total);
    } catch (err: any) { setError(err.response?.data?.detail || 'Could not load products.'); }
  }, [user?.is_admin, productSearch, productStatus, productStock, productCategory, productPage, setError]);
  useEffect(() => { loadProducts(); }, [loadProducts]);

  if (!user?.is_admin) return <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-8 text-center"><CircleAlert className="mx-auto text-red-300" /><h1 className="mt-3 text-xl font-bold">Administrator access required</h1><p className="mt-2 text-sm text-text-muted">Sign in with your store administrator account to manage the catalog.</p><Link to="/auth/login" className="fortis-btn-primary mt-5 inline-flex">Sign in</Link></div>;

  const resetProduct = () => { setProduct(emptyProduct); setEditingId(''); if (location.pathname !== '/admin/products') navigate('/admin/products', { replace: true }); };
  const createCategory = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try { const created = (await storeApi.createCategory({ name: categoryName })).data as StoreCategory; setCategoryOptions(current => [...current.filter(c => c.slug !== created.slug), created]); setCategoryName(''); setNotice('Category saved and ready to use.'); }
    catch (err: any) { setError(err.response?.data?.detail || 'Could not save category.'); }
    finally { setSaving(false); }
  };
  const saveProduct = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      let specifications: Record<string, string>;
      try { specifications = JSON.parse(product.specifications || '{}'); }
      catch { throw new Error('Specifications must be valid JSON, for example {"Material":"Steel"}.'); }
      if (!specifications || Array.isArray(specifications) || typeof specifications !== 'object') throw new Error('Specifications must be a JSON object.');
      let variants: StoreProduct['variants'] = [];
      try { variants = JSON.parse(product.variants || '[]'); }
      catch { throw new Error('Variants must be valid JSON.'); }
      if (!Array.isArray(variants)) throw new Error('Variants must be a JSON array.');
      if (!product.image) throw new Error('Upload a product image before saving.');
      const payload = {
        name: product.name.trim(), brand: product.brand.trim(), category_id: product.category_id,
        description: product.description.trim(), image: product.image,
        price_paise: Math.round(Number(product.price) * 100), stock_quantity: Number(product.stock_quantity),
        sku: product.sku.trim(), tags: product.tags.split(',').map(t => t.trim()).filter(Boolean),
        specifications, variants, featured: product.featured, active: product.active, demo_only: product.demo_only,
      };
      if (editingId) await storeApi.updateProduct(editingId, payload);
      else await storeApi.createProduct(payload);
      await loadProducts();
      const wasEditing = !!editingId;
      resetProduct(); setNotice(wasEditing ? 'Product updated.' : 'Product added to the store.');
    } catch (err: any) { setError(err.response?.data?.detail || err.message || 'Could not save product.'); }
    finally { setSaving(false); }
  };
  const editProduct = (item: StoreProduct) => {
    setEditingId(item.id);
    setProduct({ name: item.name, brand: item.brand || '', category_id: item.category_id, description: item.description || '', image: item.image || '', price: (item.price_paise / 100).toFixed(2), stock_quantity: String(item.stock_quantity), sku: item.sku || '', tags: (item.tags || []).join(', '), specifications: JSON.stringify(item.specifications || {}, null, 2), variants: JSON.stringify(item.variants || [], null, 2), featured: !!item.featured, active: item.active !== false, demo_only: !!item.demo_only });
    document.getElementById('store-product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  useEffect(() => {
    if (location.pathname.endsWith('/new')) { setEditingId(''); setProduct(emptyProduct); }
    else if (productId) storeApi.adminProduct(productId).then(editProduct).catch((err: any) => setError(err.response?.data?.detail || 'Could not load this product.'));
  }, [productId, location.pathname]);
  const removeProduct = async (item: StoreProduct) => {
    if (!window.confirm(`Remove “${item.name}” from the store?`)) return;
    try { await storeApi.deleteProduct(item.id); await loadProducts(); setNotice(`${item.name} was removed from the store.`); if (editingId === item.id) resetProduct(); }
    catch (err: any) { setError(err.response?.data?.detail || 'Could not remove product.'); }
  };
  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try { const result = await storeApi.uploadProductImage(file); setProduct(current => ({ ...current, image: result.image })); setNotice('Product image uploaded.'); }
    catch (err: any) { setError(err.response?.data?.detail || 'Could not upload this image.'); }
    finally { setUploading(false); }
  };

  return <section className="mx-auto max-w-5xl">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-4"><BrandLogo className="h-14 w-14 shrink-0 sm:h-16 sm:w-16"/><div><p className="text-xs font-semibold uppercase tracking-widest text-brand-light">Store administration</p><h1 className="mt-1 text-2xl font-black">Catalog management</h1><p className="mt-2 text-sm text-text-muted">Add complete product details, upload an image, edit listings, or remove them from the store.</p></div></div><Link to="/store" className="fortis-btn-secondary">View store</Link></div>
    <div className="mt-7 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
      <form onSubmit={createCategory} className="h-fit rounded-2xl border border-white/[.08] p-5"><h2 className="font-bold">Add category</h2><label className="fortis-label mt-4">Category name<input required minLength={2} value={categoryName} onChange={e => setCategoryName(e.target.value)} className="fortis-input mt-1" /></label><button disabled={saving} className="fortis-btn-secondary mt-3 w-full">Save category</button><div className="mt-5 space-y-2">{categoryOptions.map(c => <div key={c.id} className="flex justify-between rounded-lg bg-white/[.03] px-3 py-2 text-xs"><span>{c.name}</span><span className="text-text-muted">{c.product_count} items</span></div>)}</div></form>
      <form id="store-product-form" onSubmit={saveProduct} className="scroll-mt-5 rounded-2xl border border-white/[.08] p-5"><div className="flex items-center justify-between gap-2"><h2 className="font-bold">{editingId ? 'Edit product' : 'Add product'}</h2>{editingId && <button type="button" onClick={resetProduct} className="text-xs text-text-muted hover:text-white">Cancel edit</button>}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="fortis-label">Product name<input required minLength={2} maxLength={160} value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} className="fortis-input mt-1" /></label>
          <label className="fortis-label">Brand<input maxLength={100} value={product.brand} onChange={e => setProduct({ ...product, brand: e.target.value })} className="fortis-input mt-1" /></label>
          <label className="fortis-label">SKU<input value={product.sku} onChange={e => setProduct({ ...product, sku: e.target.value })} className="fortis-input mt-1" /></label>
          <label className="fortis-label">Category<select required value={product.category_id} onChange={e => setProduct({ ...product, category_id: e.target.value })} className="fortis-input mt-1"><option value="">Choose category</option>{categoryOptions.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></label>
          <label className="fortis-label">Price (INR)<input required type="number" min="0" step="0.01" value={product.price} onChange={e => setProduct({ ...product, price: e.target.value })} className="fortis-input mt-1" /></label>
          <label className="fortis-label">Stock quantity<input required type="number" min="0" step="1" value={product.stock_quantity} onChange={e => setProduct({ ...product, stock_quantity: e.target.value })} className="fortis-input mt-1" /></label>
          <label className="fortis-label sm:col-span-2">Description<textarea maxLength={5000} value={product.description} onChange={e => setProduct({ ...product, description: e.target.value })} className="fortis-input mt-1 min-h-24" /></label>
          <label className="fortis-label sm:col-span-2">Product image<input required={!product.image} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { uploadImage(e.target.files?.[0]); e.currentTarget.value = ''; }} className="fortis-input mt-1 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2" /><span className="mt-1 block text-[11px] text-text-muted">JPEG, PNG, or WebP. Maximum 8 MB. {uploading ? 'Uploading…' : product.image ? 'Image ready.' : 'Choose a product photo.'}</span></label>
          <label className="fortis-label sm:col-span-2">Tags<span className="mt-1 block text-[11px] text-text-muted">Separate tags with commas.</span><input value={product.tags} onChange={e => setProduct({ ...product, tags: e.target.value })} className="fortis-input mt-1" placeholder="strength, home gym, training" /></label>
          <label className="fortis-label sm:col-span-2">Specifications (JSON)<textarea value={product.specifications} onChange={e => setProduct({ ...product, specifications: e.target.value })} className="fortis-input mt-1 min-h-24 font-mono text-xs" placeholder={'{"Material":"Steel","Color":"Black"}'} /></label>
          <label className="fortis-label sm:col-span-2">Variants (JSON)<textarea value={product.variants} onChange={e => setProduct({ ...product, variants: e.target.value })} className="fortis-input mt-1 min-h-28 font-mono text-xs" placeholder={'[{"name":"Medium / Black","sku":"SKU-M-B","price_paise":19900,"stock_quantity":10,"attributes":{"size":"M","color":"Black"}}]'} /><span className="mt-1 block text-[11px] text-text-muted">Each variant holds its own SKU, price, stock, and category-specific attributes. Product stock and starting price are calculated from variants.</span></label>
          <div className="flex flex-wrap gap-4 sm:col-span-2">{([['featured', 'Featured'], ['active', 'Visible in store'], ['demo_only', 'Demo only; cannot be purchased']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-text-secondary"><input type="checkbox" checked={product[key]} onChange={e => setProduct({ ...product, [key]: e.target.checked })} className="accent-orange-500" />{label}</label>)}</div>
        </div>
        {product.image && <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/[.03] p-3"><img src={productImageSrc(product.image)} alt="Product preview" className="h-20 w-20 rounded-lg object-cover" /><span className="text-xs text-text-muted">Image preview</span></div>}
        <button disabled={saving || uploading || !categoryOptions.length} className="fortis-btn-primary mt-4 w-full">{saving ? 'Saving…' : editingId ? 'Save product changes' : 'Add product to store'}</button>
      </form>
    </div>
      <div className="mt-10"><div className="mb-4 flex items-end justify-between"><div><h2 className="text-xl font-bold">Products</h2><p className="mt-1 text-xs text-text-muted">{productTotal} matching products</p></div><Link to="/admin/products/new" className="fortis-btn-primary inline-flex items-center gap-2"><Plus size={15}/>Add product</Link></div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><input value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Search name, SKU, brand" aria-label="Search products" className="fortis-input" /><select value={productCategory} onChange={e => { setProductCategory(e.target.value); setProductPage(1); }} aria-label="Filter by category" className="fortis-input"><option value="">All categories</option>{categoryOptions.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select><select value={productStatus} onChange={e => { setProductStatus(e.target.value); setProductPage(1); }} aria-label="Filter by status" className="fortis-input"><option value="all">All statuses</option><option value="active">Active</option><option value="archived">Archived</option></select><select value={productStock} onChange={e => { setProductStock(e.target.value); setProductPage(1); }} aria-label="Filter by inventory" className="fortis-input"><option value="all">All stock</option><option value="out">Out of stock</option><option value="low">Low stock</option><option value="in_stock">In stock</option></select></div>
      <div className="space-y-3">{products.map(item => <article key={item.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border border-white/[.08] bg-white/[.02] p-3 ${item.active === false ? 'opacity-55' : ''}`}><div className="h-16 w-16 flex-none overflow-hidden rounded-xl bg-dark-card">{item.image && <img src={productImageSrc(item.image)} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold">{item.name}</p><p className="mt-1 text-xs text-text-muted">{categoryLabel(categories, item.category_id)} · {inr(item.price_paise)} · stock {item.stock_quantity} · {item.active === false ? 'Removed' : 'Visible'}</p></div><button onClick={() => navigate(`/admin/products/${item.id}/edit`)} className="fortis-btn-secondary px-3 py-2 text-xs">Edit</button>{item.active !== false && <button onClick={() => removeProduct(item)} className="rounded-lg border border-red-400/20 px-3 py-2 text-xs text-red-200 hover:bg-red-500/10">Remove</button>}</article>)}{!products.length && <p className="rounded-xl border border-white/[.08] p-6 text-center text-sm text-text-muted">No products in the catalog yet.</p>}</div>
      {productPages > 1 && <div className="mt-4 flex items-center justify-center gap-4"><button disabled={productPage <= 1} onClick={() => setProductPage(n => n - 1)} className="fortis-btn-secondary disabled:opacity-40">Previous</button><span className="text-xs text-text-muted">Page {productPage} of {productPages}</span><button disabled={productPage >= productPages} onClick={() => setProductPage(n => n + 1)} className="fortis-btn-secondary disabled:opacity-40">Next</button></div>}
    </div>
  </section>;
}
/* â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ order confirmation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function OrderConfirmation({ order, error, setToast }: { order: any; error: string; setToast: (s: string) => void }) {
  if (!order) return <div className="py-16 text-center text-text-muted">{error || 'Loading orderâ€¦'}</div>;
  const status = String(order.order_status || 'placed').toLowerCase();
  const stepIndex = Math.max(0, ORDER_STEPS.indexOf(status));
  const copy = async () => { try { await navigator.clipboard.writeText(order.order_number); setToast('Order number copied'); } catch { /* ignore */ } };
  const a = order.shipping_address_snapshot;
  return <div className="mx-auto max-w-2xl rounded-3xl border border-white/[.08] bg-white/[.025] p-5 sm:p-10">
    <div className="text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-500/10 text-amber-300"><Check /></div>
      <h1 className="mt-4 text-3xl font-black">Order received</h1>
      <p className="mt-2 text-sm text-text-secondary">Payment is pending. A payment gateway must be connected before payment can be collected.</p>
      <button onClick={copy} className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold hover:border-brand/50" aria-label={`Copy order number ${order.order_number}`}>{order.order_number}<Copy size={14} className="text-text-muted" /></button>
    </div>

    <ol className="my-8 grid grid-cols-5 gap-1 text-center text-[10px] sm:text-xs" aria-label="Order progress">
      {ORDER_STEPS.map((s, i) => <li key={s} className="relative">
        <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${i <= stepIndex ? 'bg-brand text-white' : 'bg-white/10 text-text-muted'}`}>{i < stepIndex ? <Check size={13} /> : i + 1}</div>
        <p className={`mt-1.5 capitalize ${i <= stepIndex ? 'text-white' : 'text-text-muted'}`}>{s}</p>
      </li>)}
    </ol>

    <div className="divide-y divide-white/[.08] rounded-2xl border border-white/[.08] px-4 text-left">
      {order.items?.map((i: any) => <div key={i.product_id} className="flex justify-between gap-3 py-3 text-sm"><span className="min-w-0 truncate">{i.name} Ã— {i.quantity}</span><b className="flex-none">{inr(i.line_total_paise)}</b></div>)}
      <div className="flex justify-between py-4 font-bold"><span>Total</span><span>{inr(order.grand_total_paise)}</span></div>
    </div>
    {a && <div className="mt-6 text-left text-sm leading-6 text-text-muted"><b className="text-text-secondary">Delivery address</b><p>{a.name} Â· {a.phone}</p><p>{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postal_code}</p></div>}
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
      <Link to="/store/orders" className="fortis-btn-primary inline-flex items-center justify-center gap-2">View my orders <ArrowRight size={15} /></Link>
      <Link to="/store" className="fortis-btn-secondary inline-flex items-center justify-center gap-2"><Sparkles size={14} /> Keep shopping</Link>
    </div>
  </div>;
}
