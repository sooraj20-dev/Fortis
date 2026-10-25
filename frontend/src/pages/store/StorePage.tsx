import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import {
  ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Copy, Dumbbell, Flame, Heart, Home, Minus,
  Package, Plus, Search, Share2, ShieldCheck, ShoppingBag, SlidersHorizontal, Sparkles, Trash2, Truck, X, Zap
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

/* ─────────────────────────── helpers ─────────────────────────── */

const blankCart: CartSummary = { items: [], subtotal_paise: 0, shipping_paise: 0, total_paise: 0, currency: 'INR' };
const readGuest = (): CartSummary => {
  try { return JSON.parse(localStorage.getItem('fortis-store-guest-cart') || 'null') || blankCart; }
  catch { return blankCart; }
};
const writeGuest = (cart: CartSummary) => {
  try { localStorage.setItem('fortis-store-guest-cart', JSON.stringify(cart)); } catch { /* storage full */ }
};
const recalc = (c: CartSummary): CartSummary => {
  const subtotal = c.items.reduce((s, i) => s + i.line_total_paise, 0);
  return { ...c, subtotal_paise: subtotal, total_paise: subtotal + (c.shipping_paise || 0) };
};
const categoryLabel = (categories: StoreCategory[], id: string) => categories.find(c => c.slug === id)?.name || id;

/** Small localStorage-backed list (wishlist, recently viewed). */
function useStoredList<T>(key: string): [T[], (fn: (l: T[]) => T[]) => void] {
  const [list, setList] = useState<T[]>(() => {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
  });
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
  n <= 0 ? { label: 'Out of Stock', dot: 'bg-red-400', text: 'text-red-300' }
    : n <= 5 ? { label: `Only ${n} left`, dot: 'bg-amber-400', text: 'text-amber-300' }
      : { label: 'In Stock', dot: 'bg-emerald-400', text: 'text-emerald-300' };

const ORDER_STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];

/* ─────────────────────────── UI components ─────────────────────────── */

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[.06] ${className}`} aria-hidden="true" />;
}

function ProductSkeletons({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5" aria-busy="true" aria-label="Loading products">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex flex-col">
          <Skeleton className="aspect-[3/4] !rounded-2xl" />
          <Skeleton className="mt-3 h-3 w-1/3" />
          <Skeleton className="mt-2 h-4 w-3/4" />
          <Skeleton className="mt-3 h-8 w-full !rounded-xl" />
        </div>
      ))}
    </div>
  );
}

/** Redesigned Cult-Store inspired ProductCard */
function ProductCard({
  product, categories, onAdd, onBuy, onQuick, saved, onSave, busy, className = ''
}: {
  product: StoreProduct; categories: StoreCategory[]; onAdd: (p: StoreProduct) => Promise<boolean>;
  onBuy: (p: StoreProduct) => void; onQuick: (p: StoreProduct) => void;
  saved: boolean; onSave: (p: StoreProduct) => void; busy: boolean; className?: string;
}) {
  const stock = stockInfo(product.stock_quantity);
  const catName = categoryLabel(categories, product.category_id);
  const isOutOfStock = product.stock_quantity <= 0;

  return (
    <article className={`group flex min-w-0 flex-col ${className}`}>
      {/* Product Image Frame */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-[#14141c] ring-1 ring-white/[.06] transition-all duration-300 group-hover:ring-brand/40 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
        <Link to={`/store/product/${product.slug}`} aria-label={`View ${product.name}`} className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          {product.image ? (
            <img
              src={productImageSrc(product.image)}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full w-full place-items-center bg-[radial-gradient(ellipse_at_70%_20%,rgba(249,115,22,.15),transparent_60%),linear-gradient(140deg,#1a1a24,#0d0d12)]">
              <Package className="h-12 w-12 text-white/20" aria-hidden="true" />
            </div>
          )}
        </Link>

        {/* Top Badges & Actions */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-2.5 sm:p-3">
          <div className="flex flex-col items-start gap-1">
            {product.featured && (
              <span className="rounded-full bg-brand px-2.5 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase shadow-sm">
                Featured
              </span>
            )}
            {!isOutOfStock && product.stock_quantity <= 5 && (
              <span className="rounded-full bg-amber-500/95 px-2 py-0.5 text-[9px] font-bold text-black uppercase tracking-wide">
                {stock.label}
              </span>
            )}
            {isOutOfStock && (
              <span className="rounded-full bg-red-600/90 px-2 py-0.5 text-[9px] font-bold text-white uppercase tracking-wide">
                Sold Out
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSave(product); }}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`}
            className="pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-black/60 backdrop-blur-md transition-all duration-200 hover:bg-black/90 hover:scale-110 active:scale-90"
          >
            <Heart size={15} className={`transition-all ${saved ? 'fill-brand text-brand scale-110' : 'text-white/80 hover:text-white'}`} />
          </button>
        </div>

        {/* Desktop Quick View Overlay on Hover */}
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onQuick(product); }}
          className="absolute inset-x-3 bottom-3 hidden items-center justify-center gap-1.5 rounded-xl bg-black/80 py-2.5 text-xs font-semibold text-white opacity-0 backdrop-blur-md transition-all duration-200 group-hover:opacity-100 hover:bg-black focus-visible:opacity-100 md:flex shadow-lg"
        >
          <Zap size={13} className="text-brand-light" /> Quick view
        </button>
      </div>

      {/* Info & Purchase Area */}
      <div className="flex flex-1 flex-col pt-3">
        <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          <span className="truncate">{catName}</span>
          {product.brand && <span className="ml-1 text-white/30 truncate">{product.brand}</span>}
        </div>

        <Link
          to={`/store/product/${product.slug}`}
          className="mt-1 line-clamp-2 min-h-[38px] text-xs font-semibold leading-snug text-text-primary transition-colors hover:text-brand-light sm:text-sm"
          title={product.name}
        >
          {product.name}
        </Link>

        <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
          <span className="text-sm sm:text-base font-extrabold tracking-tight tabular-nums text-white">
            {inr(product.price_paise)}
          </span>
          {product.variants && product.variants.length > 0 && (
            <span className="text-[10px] text-text-muted">Multiple Options</span>
          )}
        </div>

        {/* Interactive CTA Buttons */}
        <div className="mt-2.5">
          {product.variants?.length ? (
            <Link
              to={`/store/product/${product.slug}`}
              className="flex h-9 w-full items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-xs font-semibold text-white transition-all hover:border-brand/50 hover:bg-brand/10 hover:text-brand-light"
            >
              Choose Options
            </Link>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onAdd(product)}
                disabled={isOutOfStock || product.demo_only || busy}
                className="flex h-9 items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/[.04] px-2 text-[11px] font-semibold text-white transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed sm:text-xs"
                aria-label={`Add ${product.name} to bag`}
              >
                <Plus size={12} /> Add
              </button>
              <button
                onClick={() => onBuy(product)}
                disabled={isOutOfStock || product.demo_only || busy}
                className="flex h-9 items-center justify-center rounded-xl bg-brand px-2 text-[11px] font-semibold text-white shadow-glow transition-all hover:bg-brand-light active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed sm:text-xs"
              >
                Buy now
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

/* ─────────────────────────── Category Visual Assets & Helpers ─────────────────────────── */

const CATEGORY_VISUALS: Record<string, { image: string; fallbackAsset: string; tag: string }> = {
  'fitness-apparel': {
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/fitness-apparel/training-t-shirt.webp',
    tag: 'Activewear & Tops',
  },
  'apparel': {
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/fitness-apparel/training-t-shirt.webp',
    tag: 'Athletic Wear',
  },
  'gym-equipment': {
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/gym-equipment/adjustable-dumbbell-set.webp',
    tag: 'Benches & Systems',
  },
  'equipment': {
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/gym-equipment/adjustable-dumbbell-set.webp',
    tag: 'Strength Gear',
  },
  'training-footwear': {
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/training-footwear/cross-training-shoe.jpg',
    tag: 'Lifting & Turf',
  },
  'footwear': {
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/training-footwear/cross-training-shoe.jpg',
    tag: 'Performance Footwear',
  },
  'recovery-mobility': {
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/recovery-mobility/training-mat.webp',
    tag: 'Rollers & Mats',
  },
  'accessories': {
    image: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/accessories/shaker-bottle.webp',
    tag: 'Bottles & Straps',
  },
  'free-weights': {
    image: 'https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/free-weights/cast-iron-kettlebell-pair.jpg',
    tag: 'Kettlebells & Plates',
  },
  'sports-nutrition': {
    image: 'https://images.unsplash.com/photo-1593095948071-474c5cc2989d?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/sports-nutrition/whey-protein-concentrate-1kg.jpg',
    tag: 'Proteins & Fuel',
  },
  'smart-fitness-devices': {
    image: 'https://images.unsplash.com/photo-1576243345690-4e4b79b63288?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/smart-fitness-devices/bluetooth-body-composition-scale.jpg',
    tag: 'Smart Trackers',
  },
  'cardio-equipment': {
    image: 'https://images.unsplash.com/photo-1538805060514-97d9cc17730c?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/cardio-equipment/compact-under-desk-pedal-trainer.jpg',
    tag: 'Cardio & Endurance',
  },
  'combat-sports': {
    image: 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/combat-sports/curved-focus-mitt-pair.jpg',
    tag: 'Gloves & Pads',
  },
  'yoga-and-pilates': {
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/yoga-and-pilates/cork-yoga-block-pair.jpg',
    tag: 'Mats & Cork Blocks',
  },
  'calisthenics': {
    image: 'https://images.unsplash.com/photo-1599058917765-a780eda07a3e?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/calisthenics/parallettes-training-bars.jpg',
    tag: 'Rings & Bars',
  },
  'outdoor-fitness': {
    image: 'https://images.unsplash.com/photo-1483721074573-500b58e2d425?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/outdoor-fitness/reflective-trail-running-vest.jpg',
    tag: 'Running & Trail',
  },
  'resistance-training': {
    image: 'https://images.unsplash.com/photo-1598971639058-fab3c3109a00?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/resistance-training/adjustable-ankle-and-wrist-weights.jpg',
    tag: 'Bands & Weights',
  },
  'home-gym-packages': {
    image: 'https://images.unsplash.com/photo-1540497077202-7c8a3999166f?q=80&w=800&auto=format&fit=crop',
    fallbackAsset: '/store-assets/home-gym-packages/doorway-strength-starter-bundle.jpg',
    tag: 'Starter Bundles',
  },
};

const DEFAULT_STORE_CATEGORIES: StoreCategory[] = [
  { id: 'cat-1', name: 'Fitness Apparel', slug: 'fitness-apparel', product_count: 12, description: 'Athletic training activewear and performance tees' },
  { id: 'cat-2', name: 'Gym Equipment', slug: 'gym-equipment', product_count: 18, description: 'Heavy-duty benches, dumbbells and power racks' },
  { id: 'cat-3', name: 'Training Footwear', slug: 'training-footwear', product_count: 9, description: 'Zero-drop lifting shoes and turf cross-trainers' },
  { id: 'cat-4', name: 'Recovery & Mobility', slug: 'recovery-mobility', product_count: 14, description: 'Deep tissue foam rollers and mobility mats' },
  { id: 'cat-5', name: 'Free Weights', slug: 'free-weights', product_count: 16, description: 'Cast iron kettlebells and steel dumbbells' },
  { id: 'cat-6', name: 'Sports Nutrition', slug: 'sports-nutrition', product_count: 15, description: 'Whey isolate, creatine and hydration packs' },
  { id: 'cat-7', name: 'Accessories', slug: 'accessories', product_count: 22, description: 'Shaker bottles, gym bags and lifting straps' },
  { id: 'cat-8', name: 'Smart Fitness Devices', slug: 'smart-fitness-devices', product_count: 8, description: 'Body composition scales and metrics devices' },
];

const getCategoryImageUrl = (cat: { slug: string; name?: string; image?: string }): string => {
  if (cat.image && cat.image.trim()) {
    return imageSrc(cat.image);
  }
  const slug = (cat.slug || '').toLowerCase();
  for (const [key, visual] of Object.entries(CATEGORY_VISUALS)) {
    if (slug.includes(key) || (cat.name || '').toLowerCase().includes(key)) {
      return visual.image;
    }
  }
  return 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=800&auto=format&fit=crop';
};

const getCategoryFallbackAsset = (slug: string): string => {
  return CATEGORY_VISUALS[slug]?.fallbackAsset || '/landing_imgs/hero.png';
};

function Rail({ title, subtitle, onViewAll, children }: {
  title: string; subtitle?: string; onViewAll?: () => void; children: React.ReactNode;
}) {
  return (
    <section className="mb-12">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-text-muted">{subtitle}</p>}
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-xs font-bold text-brand-light transition hover:text-white"
          >
            View All <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </section>
  );
}

/* ─────────────────────────── Moving Hero Banner Carousel ─────────────────────────── */

interface BannerSlide {
  id: string;
  badgeTitle: string;
  badgeSubtitle?: string;
  badgeStyle: 'festival' | 'pro' | 'speed' | 'recovery';
  headline: string;
  highlight: string;
  subtext: string;
  ctaText: string;
  categorySlug?: string;
  imageUrl: string;
  fallbackImage: string;
  overlayGradient: string;
}

const BANNER_SLIDES: BannerSlide[] = [
  {
    id: 'fitness-festival',
    badgeTitle: 'GREAT FITNESS FESTIVAL',
    badgeSubtitle: 'ANNUAL ACTIVEWEAR SALE',
    badgeStyle: 'festival',
    headline: 'Fresh Wardrobe Picks At',
    highlight: 'Extra 10% OFF',
    subtext: 'Engineered training tees, seamless tanks & breathable activewear crafted for every rep.',
    ctaText: 'SHOP APPAREL',
    categorySlug: 'fitness-apparel',
    imageUrl: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=2000&auto=format&fit=crop',
    fallbackImage: '/landing_imgs/hero.png',
    overlayGradient: 'from-amber-950/80 via-black/40 to-black/85',
  },
  {
    id: 'heavy-equipment',
    badgeTitle: 'PRO STRENGTH SERIES',
    badgeSubtitle: 'COMMERCIAL GRADE',
    badgeStyle: 'pro',
    headline: 'Transform Your Training Space',
    highlight: 'Home Gym Equipment',
    subtext: 'Adjustable dumbbell systems, heavy-duty benches, and Olympic resistance essentials.',
    ctaText: 'SHOP EQUIPMENT',
    categorySlug: 'gym-equipment',
    imageUrl: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=2000&auto=format&fit=crop',
    fallbackImage: '/landing_imgs/hero_pose.png',
    overlayGradient: 'from-orange-950/80 via-black/45 to-black/85',
  },
  {
    id: 'cross-footwear',
    badgeTitle: 'NEW ARRIVALS 2026',
    badgeSubtitle: 'STABILITY & EXPLOSION',
    badgeStyle: 'speed',
    headline: 'Zero-Drop Stability Footwear',
    highlight: 'Grip Every Surface',
    subtext: 'Responsive cushioning and flat-sole traction for heavy squats, deadlifts, and sprints.',
    ctaText: 'SHOP FOOTWEAR',
    categorySlug: 'training-footwear',
    imageUrl: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?q=80&w=2000&auto=format&fit=crop',
    fallbackImage: '/landing_imgs/hero.png',
    overlayGradient: 'from-stone-900/80 via-black/45 to-black/85',
  },
  {
    id: 'recovery-tech',
    badgeTitle: 'RECOVERY & MOBILITY',
    badgeSubtitle: 'AI SYNC COMPATIBLE',
    badgeStyle: 'recovery',
    headline: 'Rest & Recover Faster',
    highlight: 'Deep Tissue Tech',
    subtext: 'Textured foam rollers, mobility exercise mats, and smart body composition trackers.',
    ctaText: 'SHOP RECOVERY',
    categorySlug: 'recovery-mobility',
    imageUrl: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?q=80&w=2000&auto=format&fit=crop',
    fallbackImage: '/landing_imgs/hero_pose.png',
    overlayGradient: 'from-zinc-900/80 via-black/45 to-black/85',
  },
];

function HeroBannerCarousel({
  onSelectCategory
}: {
  onSelectCategory: (slug?: string) => void;
}) {
  const [current, setCurrent] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const prevSlide = useCallback(() => {
    setCurrent(c => (c - 1 + BANNER_SLIDES.length) % BANNER_SLIDES.length);
  }, []);

  const nextSlide = useCallback(() => {
    setCurrent(c => (c + 1) % BANNER_SLIDES.length);
  }, []);

  // Auto-advance every 4.8s; paused on hover/focus and disabled for reduced motion
  useEffect(() => {
    if (isPaused) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(nextSlide, 4800);
    return () => clearInterval(timer);
  }, [isPaused, nextSlide]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    if (touchStart - touchEnd > 50) nextSlide();
    if (touchStart - touchEnd < -50) prevSlide();
    setTouchStart(null);
  };

  return (
    <div
      className="relative mb-12 overflow-hidden rounded-3xl border border-white/[.08] shadow-2xl bg-black"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="Promotional campaign carousel"
    >
      {/* Sliding Viewport Container */}
      <div
        className="flex transition-transform duration-700 ease-out h-[360px] sm:h-[420px] lg:h-[460px] select-none"
        style={{ transform: `translateX(-${current * 100}%)` }}
      >
        {BANNER_SLIDES.map((slide, idx) => (
          <div
            key={slide.id}
            className="relative flex h-full w-full flex-none items-center overflow-hidden"
          >
            {/* Background Image with Fallback */}
            <img
              src={slide.imageUrl}
              onError={(e) => {
                // If remote image fails, use local hero fallback
                (e.target as HTMLImageElement).src = slide.fallbackImage;
              }}
              alt={slide.headline}
              className="absolute inset-0 h-full w-full object-cover object-center transform transition-transform duration-1000 scale-100 hover:scale-105"
            />

            {/* Gradient Overlays for High Legibility */}
            <div className={`absolute inset-0 bg-gradient-to-r ${slide.overlayGradient}`} />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(0,0,0,0.6)_100%)]" />

            {/* Slide Content Layer */}
            <div className="relative z-10 grid w-full grid-cols-1 items-center gap-6 px-6 pb-9 sm:px-20 sm:pb-10 lg:grid-cols-12">
              {/* Left / Center Emblem or Badge (Cult Store Festival Style) */}
              <div className="flex min-w-0 justify-start lg:col-span-5">
                {slide.badgeStyle === 'festival' ? (
                  <div className="inline-flex flex-col items-center justify-center rounded-2xl border-2 border-amber-400/50 bg-gradient-to-br from-amber-600/35 via-orange-950/70 to-black/80 px-5 py-4 sm:px-7 sm:py-5 backdrop-blur-md shadow-[0_0_40px_rgba(245,158,11,0.25)]">
                    <div className="flex items-center gap-1.5 text-[9px] sm:text-[10px] font-black tracking-[0.25em] text-amber-300 uppercase">
                      <Sparkles size={11} className="text-amber-300 animate-pulse" />
                      <span>{slide.badgeSubtitle}</span>
                      <Sparkles size={11} className="text-amber-300 animate-pulse" />
                    </div>
                    <div className="mt-1 text-center font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-amber-100 via-amber-300 to-amber-500 text-3xl sm:text-4xl lg:text-5xl leading-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                      GREAT
                    </div>
                    <div className="text-center font-black tracking-tight text-white text-2xl sm:text-3xl lg:text-4xl leading-none drop-shadow-[0_4px_12px_rgba(245,158,11,0.7)]">
                      FITNESS
                    </div>
                    <div className="text-center font-black tracking-[0.3em] text-amber-400 text-xs sm:text-sm lg:text-base leading-none uppercase mt-0.5">
                      FESTIVAL
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex flex-col rounded-2xl border border-white/15 bg-black/60 px-5 py-3.5 backdrop-blur-md shadow-xl">
                    <span className="text-[10px] font-black tracking-[0.2em] text-brand-light uppercase flex items-center gap-1.5">
                      <Flame size={12} />
                      {slide.badgeSubtitle}
                    </span>
                    <span className="mt-0.5 text-base sm:text-lg font-black text-white uppercase tracking-tight">
                      {slide.badgeTitle}
                    </span>
                  </div>
                )}
              </div>

              {/* Right Side Text and Solid White CTA Button */}
              <div className="flex min-w-0 flex-col items-start text-left lg:col-span-7 lg:items-end lg:text-right">
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-white/90">
                  {slide.headline}
                </p>
                <h2 className="mt-1 text-2xl sm:text-4xl lg:text-4xl xl:text-5xl font-black text-white tracking-tight uppercase leading-none drop-shadow-md">
                  {slide.highlight}
                </h2>
                <p className="mt-3 text-xs sm:text-sm text-white/80 max-w-lg leading-relaxed hidden sm:block">
                  {slide.subtext}
                </p>
                <button
                  onClick={() => onSelectCategory(slide.categorySlug)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3 text-xs sm:text-sm font-black tracking-wider text-black uppercase transition-all duration-200 hover:bg-brand-light hover:text-white hover:scale-105 active:scale-95 shadow-2xl cursor-pointer"
                >
                  <span>{slide.ctaText}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Buttons: Left (<) and Right (>) Circles */}
      <button
        onClick={prevSlide}
        aria-label="Previous slide"
        className="absolute left-3 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-brand hover:text-white active:scale-95 cursor-pointer sm:left-4 sm:grid sm:h-11 sm:w-11"
      >
        <ChevronLeft size={22} className="stroke-[2.5]" />
      </button>

      <button
        onClick={nextSlide}
        aria-label="Next slide"
        className="absolute right-3 top-1/2 z-20 hidden -translate-y-1/2 place-items-center rounded-full bg-white text-black shadow-2xl transition-all duration-200 hover:scale-110 hover:bg-brand hover:text-white active:scale-95 cursor-pointer sm:right-4 sm:grid sm:h-11 sm:w-11"
      >
        <ChevronRight size={22} className="stroke-[2.5]" />
      </button>

      {/* Slide Indicators / Dots Bottom */}
      <div className="absolute bottom-3.5 sm:bottom-5 inset-x-0 z-20 flex items-center justify-center gap-2">
        {BANNER_SLIDES.map((s, idx) => (
          <button
            key={s.id}
            onClick={() => setCurrent(idx)}
            aria-label={`Go to slide ${idx + 1}`}
            className={`h-2 rounded-full transition-all duration-300 ${
              idx === current ? 'w-8 bg-brand shadow-glow' : 'w-2 bg-white/40 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── cart drawer ─────────────────────────── */

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

  return (
    <div className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div onClick={onClose} className={`absolute inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your bag"
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0e0e14] shadow-2xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-white/[.08] px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-brand-light" />
            <h2 className="text-lg font-bold">Your Bag</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-text-muted">
              {count}
            </span>
          </div>
          <button ref={closeRef} onClick={onClose} aria-label="Close bag" className="grid h-9 w-9 place-items-center rounded-xl text-text-muted transition hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          {cart.items.length === 0 ? (
            <div className="grid h-full place-items-center text-center py-16">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white/[.04] text-text-muted">
                  <ShoppingBag className="h-8 w-8" />
                </div>
                <p className="mt-4 text-base font-bold text-white">Your bag is empty</p>
                <p className="mt-1 text-xs text-text-muted max-w-[220px] mx-auto">
                  Add fitness gear, supplements, or activewear to get started.
                </p>
                <button onClick={onClose} className="fortis-btn-primary mt-6 inline-flex text-xs">
                  Explore Products
                </button>
              </div>
            </div>
          ) : (
            <ul className="divide-y divide-white/[.07]">
              {cart.items.map(i => (
                <li key={i.item_id} className="flex gap-3 py-4">
                  <Link to={`/store/product/${i.product.slug}`} onClick={onClose} className="h-20 w-20 flex-none overflow-hidden rounded-xl bg-dark-card border border-white/5">
                    {i.product.image ? (
                      <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package className="m-6 text-text-muted" />
                    )}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-2">
                      <div>
                        <Link to={`/store/product/${i.product.slug}`} onClick={onClose} className="line-clamp-2 text-xs font-semibold text-text-primary hover:text-brand-light">
                          {i.product.name}
                        </Link>
                        {i.variant_name && <p className="mt-0.5 text-[11px] text-text-muted">{i.variant_name}</p>}
                      </div>
                      <button onClick={() => onRemove(i.item_id)} aria-label={`Remove ${i.product.name}`} className="text-text-muted hover:text-red-400 p-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {!i.available && <p className="mt-1 text-[11px] text-amber-300">Availability changed. Please review.</p>}
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center rounded-lg border border-white/10 bg-white/[.03]">
                        <button aria-label="Decrease quantity" onClick={() => i.quantity > 1 ? onQty(i.item_id, i.quantity - 1) : onRemove(i.item_id)} className="grid h-7 w-7 place-items-center hover:bg-white/10 rounded-l-lg">
                          <Minus size={12} />
                        </button>
                        <span className="w-6 text-center text-xs font-bold">{i.quantity}</span>
                        <button aria-label="Increase quantity" disabled={i.quantity >= i.product.stock_quantity} onClick={() => onQty(i.item_id, i.quantity + 1)} className="grid h-7 w-7 place-items-center hover:bg-white/10 rounded-r-lg disabled:opacity-30">
                          <Plus size={12} />
                        </button>
                      </div>
                      <b className="text-sm font-extrabold text-white">{inr(i.line_total_paise)}</b>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart.items.length > 0 && (
          <div className="border-t border-white/[.08] bg-[#0c0c10] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <div className="flex justify-between text-sm text-text-secondary">
              <span>Subtotal</span>
              <b className="text-white font-bold">{inr(cart.subtotal_paise)}</b>
            </div>
            <p className="mt-1 text-[10px] text-text-muted">Prices & stock verified at checkout. Free shipping available.</p>
            <button onClick={onCheckout} className="fortis-btn-primary mt-4 flex w-full items-center justify-center gap-2 py-3 text-sm font-bold shadow-glow">
              Proceed to Checkout <ArrowRight size={15} />
            </button>
            <Link to="/store/cart" onClick={onClose} className="mt-3 block text-center text-xs text-text-muted hover:text-white transition">
              View Detailed Bag
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ─────────────────────────── quick view ─────────────────────────── */

function QuickView({
  product, categories, onClose, onAdd, busy
}: {
  product: StoreProduct | null; categories: StoreCategory[]; onClose: () => void; onAdd: (p: StoreProduct) => void; busy: boolean
}) {
  useLockBody(!!product);
  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [product, onClose]);

  if (!product) return null;
  const stock = stockInfo(product.stock_quantity);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={product.name}>
      <div onClick={onClose} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative grid max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0e0e14] sm:grid-cols-2 sm:rounded-3xl shadow-2xl">
        <button onClick={onClose} aria-label="Close quick view" className="absolute right-3.5 top-3.5 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white/80 hover:text-white backdrop-blur">
          <X size={16} />
        </button>
        <div className="aspect-[4/3] bg-dark-card sm:aspect-auto">
          {product.image ? (
            <img src={productImageSrc(product.image)} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center"><Package className="h-16 w-16 text-white/20" /></div>
          )}
        </div>
        <div className="flex flex-col p-6 sm:p-7">
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-brand-light">
            {categoryLabel(categories, product.category_id)}{product.brand ? ` · ${product.brand}` : ''}
          </p>
          <h3 className="mt-1 text-xl font-black text-white">{product.name}</h3>
          <p className="mt-3 text-2xl font-black text-white">{inr(product.price_paise)}</p>
          {product.stock_quantity > 0 && (
            <div className="mt-2 flex items-center gap-2 text-xs">
              <span className={`h-2 w-2 rounded-full ${stock.dot}`} />
              <span className={stock.text}>{stock.label}</span>
            </div>
          )}
          <p className="mt-4 line-clamp-4 text-xs leading-5 text-text-secondary">
            {product.description || 'Engineered fitness gear designed for optimal performance and durability.'}
          </p>
          <div className="mt-6 flex gap-2 sm:mt-auto pt-4">
            {product.variants?.length ? (
              <Link to={`/store/product/${product.slug}`} onClick={onClose} className="fortis-btn-primary flex-1 text-center text-xs">
                Choose Options
              </Link>
            ) : (
              <button
                disabled={!product.stock_quantity || product.demo_only || busy}
                onClick={() => { onAdd(product); onClose(); }}
                className="fortis-btn-primary flex-1 text-xs"
              >
                Add to Bag
              </button>
            )}
            <Link to={`/store/product/${product.slug}`} onClick={onClose} className="fortis-btn-secondary text-xs">
              Full Details
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── main page ─────────────────────────── */

export default function StorePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
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
  const [orders, setOrders] = useState<any[]>([]);
  const [order, setOrder] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [drawer, setDrawer] = useState(false);
  const [quick, setQuick] = useState<StoreProduct | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [bump, setBump] = useState(false);
  const [saved, updateSaved] = useStoredList<StoreProduct>('fortis-store-saved');
  const [recent, updateRecent] = useStoredList<StoreProduct>('fortis-store-recent');

  const path = location.pathname;
  const isProduct = path.includes('/product/');
  const slug = path.split('/product/')[1];
  const isCheckout = path.endsWith('/checkout');
  const isCart = path.endsWith('/cart');
  const isOrders = path.endsWith('/orders');
  const orderId = path.split('/orders/')[1];
  const isAdmin = path.endsWith('/admin');
  const isCatalog = !isProduct && !isCart && !isCheckout && !isOrders && !orderId && !isAdmin;

  const q = searchParams.get('q') || '';
  const category = searchParams.get('category') || '';
  const sort = searchParams.get('sort') || 'recommended';
  const page = Number(searchParams.get('page') || '1');
  const available = searchParams.get('available') === 'true';
  const showSaved = searchParams.get('saved') === '1';
  const count = cart.items.reduce((n, x) => n + x.quantity, 0);
  const isSaved = (p: StoreProduct) => saved.some(s => s.id === p.id);
  const [searchText, setSearchText] = useState(q);
  const headerRef = useRef<HTMLElement | null>(null);
  const [headerH, setHeaderH] = useState(61);

  /* data fetching */
  useEffect(() => {
    storeApi.categories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    storeApi.products({ search: '', category: '', sort: 'recommended', page: 1, available: false, featured: true, limit: 10 })
      .then(result => setFeaturedProducts(result.items))
      .catch(() => setFeaturedProducts([]))
      .finally(() => setFeaturedLoaded(true));
  }, []);

  useEffect(() => {
    if (authenticated) {
      const guest = readGuest();
      if (guest.items.length) {
        (async () => {
          try {
            let merged = await storeApi.cart();
            for (const item of guest.items) merged = await storeApi.add(item.product.id, item.quantity, item.variant_id);
            setCart(merged);
            writeGuest(blankCart);
          } catch (e: any) {
            setCart(guest);
            setError(e.response?.data?.detail || 'Some guest items could not be synced.');
          }
        })();
      } else {
        storeApi.cart().then(setCart).catch(() => setCart(blankCart));
      }
    } else {
      setCart(readGuest());
    }
  }, [authenticated]);

  useEffect(() => {
    let alive = true;
    setError('');
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
        storeApi.products({ search: '', category: p.category_id, sort: 'recommended', page: 1, available: false, limit: 6 })
          .then(d => setRelated(d.items.filter((x: StoreProduct) => x.id !== p.id).slice(0, 5)))
          .catch(() => setRelated([]));
      }).catch(() => {
        setError('This product could not be found.');
        setProductLoadFailed(true);
      });
    }
  }, [slug, isProduct, updateRecent]);

  useEffect(() => {
    if (isOrders) storeApi.orders().then(setOrders).catch(() => setError('Your orders could not be loaded.'));
  }, [isOrders]);

  useEffect(() => {
    if (orderId && orderId !== 'undefined') storeApi.order(orderId).then(setOrder).catch(() => setError('Order not found.'));
  }, [orderId]);

  /* UI effects */
  useEffect(() => { window.scrollTo({ top: 0 }); setDrawer(false); }, [path]);
  useEffect(() => {
    // Keep the sticky filter bar exactly under the header at every breakpoint.
    const el = headerRef.current;
    if (!el) return;
    const sync = () => setHeaderH(Math.round(el.getBoundingClientRect().height));
    sync();
    // Web fonts land after first paint and change text metrics, so re-sync once ready.
    document.fonts?.ready.then(sync).catch(() => { /* ignore */ });
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setSearchText(q); }, [q]);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2500);
    return () => window.clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!count) return;
    setBump(true);
    const t = window.setTimeout(() => setBump(false), 350);
    return () => window.clearTimeout(t);
  }, [count]);
  useEffect(() => {
    if (searchText === q) return;
    const t = window.setTimeout(() => setFilter('q', searchText.trim()), 350);
    return () => window.clearTimeout(t);
  }, [searchText]);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key !== 'saved' && value) next.delete('saved');
    // The header stays mounted on product, cart and checkout routes, so filters
    // applied there must route back to the catalog instead of editing the query.
    if (!isCatalog) {
      navigate(`/store${next.toString() ? `?${next.toString()}` : ''}`);
      return;
    }
    setSearchParams(next);
  };

  const toggleSaved = (p: StoreProduct) => {
    const was = isSaved(p);
    updateSaved(l => was ? l.filter(x => x.id !== p.id) : [p, ...l]);
    setToast(was ? 'Removed from saved' : 'Added to saved items');
  };

  /* Cart actions */
  const addToCart = async (p: StoreProduct, qty = 1, openDrawer = true, variantId?: string): Promise<boolean> => {
    const selected = p.variants?.find(v => v.id === variantId);
    const availableStock = selected?.stock_quantity ?? p.stock_quantity;
    if (p.variants?.length && !variantId) { setError('Please select an option first.'); return false; }
    if (p.variants?.length && !selected) { setError('Selected option is unavailable.'); return false; }
    if (!availableStock) { setError('This item is sold out.'); return false; }
    setBusyId(p.id); setError('');
    try {
      const unitPrice = selected?.price_paise ?? p.price_paise;
      if (authenticated) {
        setCart(await storeApi.add(p.id, qty, variantId));
      } else {
        const existing = readGuest();
        const found = existing.items.find(i => i.product.id === p.id && i.variant_id === variantId);
        if ((found?.quantity || 0) + qty > availableStock) throw new Error('Maximum available quantity reached.');
        const next = found
          ? { ...existing, items: existing.items.map(i => i.item_id === found.item_id ? { ...i, quantity: i.quantity + qty, line_total_paise: (i.quantity + qty) * i.unit_price_paise } : i) }
          : { ...existing, items: [...existing.items, { item_id: createIdempotencyKey(), product: p, quantity: qty, variant_id: variantId, variant_name: selected?.name, unit_price_paise: unitPrice, line_total_paise: unitPrice * qty, available: true }] };
        const done = recalc(next);
        writeGuest(done);
        setCart(done);
      }
      setToast(`${p.name} added to your bag`);
      if (openDrawer) setDrawer(true);
      return true;
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Could not add item to bag.');
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const updateQty = async (itemId: string, qty: number) => {
    try {
      if (authenticated) setCart(await storeApi.change(itemId, qty));
      else {
        const g = readGuest();
        const done = recalc({ ...g, items: g.items.map(i => i.item_id === itemId ? { ...i, quantity: qty, line_total_paise: i.unit_price_paise * qty } : i) });
        writeGuest(done);
        setCart(done);
      }
    } catch (e: any) { setError(e.response?.data?.detail || 'Could not update bag.'); }
  };

  const remove = async (itemId: string) => {
    try {
      if (authenticated) setCart(await storeApi.remove(itemId));
      else {
        const g = readGuest();
        const done = recalc({ ...g, items: g.items.filter(i => i.item_id !== itemId) });
        writeGuest(done);
        setCart(done);
      }
    } catch (e: any) { setError(e.response?.data?.detail || 'Could not remove item.'); }
  };

  const goCheckout = () => {
    setDrawer(false);
    if (!authenticated) {
      setError('Please sign in to proceed to checkout.');
      navigate('/auth/login');
    } else {
      navigate('/store/checkout');
    }
  };

  const heading = isProduct ? product?.name || 'Product Details'
    : isCart ? 'Your Bag'
    : isCheckout ? 'Checkout'
    : isOrders || orderId ? 'Orders'
    : isAdmin ? 'Store Management'
    : showSaved ? 'Saved Items'
    : category ? categoryLabel(categories, category)
    : 'All Products';

  const landing = isCatalog && !q && !category && page === 1 && !showSaved && !available;
  const list = showSaved ? saved : catalog.items;

  const card = (p: StoreProduct, className = '') => (
    <ProductCard
      key={p.id}
      className={className}
      product={p}
      categories={categories}
      onAdd={x => addToCart(x)}
      onBuy={async x => { if (await addToCart(x, 1, false)) goCheckout(); }}
      onQuick={setQuick}
      saved={isSaved(p)}
      onSave={toggleSaved}
      busy={busyId === p.id}
    />
  );

  const activeFilters = [
    q && { k: 'q', label: `“${q}”` },
    category && { k: 'category', label: categoryLabel(categories, category) },
    available && { k: 'available', label: 'In Stock' },
    sort !== 'recommended' && { k: 'sort', label: `Sort: ${sort.replace('_', ' ')}` },
  ].filter(Boolean) as { k: string; label: string }[];

  const navItem = (to: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      to={to}
      className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${active ? 'text-brand-light' : 'text-text-muted hover:text-white'}`}
      aria-current={active ? 'page' : undefined}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1520px] px-4 pb-32 text-text-primary sm:px-6 md:pb-12 lg:px-8">
      {/* ─── Announcement Bar ─── */}
      <div className="-mx-4 mb-0 flex items-center justify-center border-b border-white/[.06] bg-[#0c0c12] px-4 py-2 sm:-mx-6 lg:-mx-8">
        <p className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold tracking-[0.16em] uppercase text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand animate-pulse" />
          UPGRADE YOUR TRAINING <span className="hidden sm:inline text-white/30">—</span> <span className="text-white/80">DISCOVER YOUR FITNESS ESSENTIALS</span>
        </p>
      </div>

      {/* ─── Premium Main Header ─── */}
      <header ref={headerRef} className="sticky top-0 z-30 -mx-4 mb-4 border-b border-white/[.07] bg-[#0a0a0f]/90 backdrop-blur-xl px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          {/* Brand Logo & Tagline */}
          <Link
            to={brandHome}
            aria-label={user?.is_admin ? 'Fortis Admin Dashboard' : authenticated ? 'Fortis Dashboard' : 'Fortis Store'}
            className="flex items-center gap-2.5 flex-none group"
          >
            <img src="/fortis-mark.png" alt="FORTIS" className="h-9 w-9 object-contain transition-transform group-hover:scale-105" />
            <div className="leading-tight">
              <span className="block text-sm font-black tracking-[.16em] text-white">
                FORTIS <span className="text-brand-light">STORE</span>
              </span>
              <span className="hidden text-[9px] font-medium tracking-wider text-text-muted uppercase sm:block">
                Train better. Choose smarter.
              </span>
            </div>
          </Link>

          {/* Desktop Center Navigation (Primary Categories) */}
          <nav className="hidden min-w-0 items-center gap-1 overflow-hidden lg:flex xl:gap-2" aria-label="Catalog Navigation">
            <button
              onClick={() => navigate('/store')}
              aria-pressed={!category && !showSaved && !q && isCatalog}
              className={`flex-none whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider transition-all ${
                !category && !showSaved && !q
                  ? 'bg-white/10 text-brand-light shadow-sm'
                  : 'text-text-secondary hover:text-white hover:bg-white/[.04]'
              }`}
            >
              All Gear
            </button>
            {categories.slice(0, 6).map((c, i) => (
              <button
                key={c.id}
                onClick={() => setFilter('category', category === c.slug ? '' : c.slug)}
                aria-pressed={category === c.slug}
                className={`flex-none rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-all ${
                  // Progressive disclosure: the row runs out of space below 1536px, so the
                  // last departments only appear once there is room for them.
                  i === 3 ? 'hidden xl:inline-flex' : i > 3 ? 'hidden 2xl:inline-flex' : ''
                } ${
                  category === c.slug
                    ? 'bg-brand text-white shadow-glow'
                    : 'text-text-secondary hover:text-white hover:bg-white/[.04]'
                }`}
              >
                {c.name}
              </button>
            ))}
          </nav>

          {/* Action Icons Right */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Search Input Quick Button */}
            <button
              onClick={() => {
                document.getElementById('catalog-search')?.focus();
                document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
              }}
              aria-label="Search Catalog"
              className="hidden sm:grid h-9 w-9 place-items-center rounded-xl text-text-secondary transition hover:bg-white/[.06] hover:text-white"
            >
              <Search size={17} />
            </button>

            {/* Wishlist Link */}
            <Link
              to="/store?saved=1"
              aria-label="Saved items"
              className={`relative grid h-9 w-9 place-items-center rounded-xl text-text-secondary transition hover:bg-white/[.06] hover:text-white ${
                showSaved ? 'bg-white/10 text-brand-light' : ''
              }`}
            >
              <Heart size={17} className={saved.length > 0 ? 'fill-brand/30 text-brand' : ''} />
              {saved.length > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white shadow-sm">
                  {saved.length}
                </span>
              )}
            </Link>

            {/* Orders link */}
            {user && (
              <Link
                to="/store/orders"
                className="hidden md:flex h-9 items-center rounded-xl px-3 text-xs font-semibold text-text-secondary transition hover:bg-white/[.06] hover:text-white"
              >
                Orders
              </Link>
            )}

            {/* Admin toggle if applicable */}
            {user?.is_admin && (
              <Link
                to="/admin/dashboard"
                className="hidden lg:flex h-9 items-center rounded-xl border border-brand/30 bg-brand/10 px-3 text-xs font-bold text-brand-light transition hover:bg-brand hover:text-white"
              >
                Manage
              </Link>
            )}

            {/* Shopping Bag Button */}
            <button
              onClick={() => setDrawer(true)}
              aria-label={`Open shopping bag, ${count} items`}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3.5 text-xs font-bold transition hover:border-brand/50 hover:bg-white/[.07]"
            >
              <ShoppingBag size={15} className="text-brand-light" />
              <span className="hidden sm:inline">Bag</span>
              <span
                className={`grid min-w-[20px] place-items-center rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-black text-white transition-transform duration-300 ${
                  bump ? 'scale-125' : ''
                }`}
              >
                {count}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Global Error Banner ─── */}
      {error && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 backdrop-blur">
          <CircleAlert size={18} className="mt-0.5 flex-none" />
          <div className="flex-1">{error}</div>
          <button className="flex-none font-bold underline hover:text-white" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* ─── Breadcrumb Navigation ─── */}
      {!landing && (
        <nav aria-label="Breadcrumb" className="mb-6 flex min-w-0 items-center gap-2 text-xs text-text-muted">
          <Link to="/store" className="flex items-center gap-1.5 text-text-secondary hover:text-brand-light transition">
            <Home size={13} />
            <span>Store</span>
          </Link>
          <ChevronRight size={12} className="text-white/20" />
          <span className="truncate font-semibold text-white">{heading}</span>
        </nav>
      )}

      {isAdmin && <StoreAdmin categories={categories} user={user} setError={setError} setNotice={setToast} />}

      {/* ─── Catalog & Landing Views ─── */}
      {isCatalog && (
        <>
          {landing && (
            <>
              {/* ─── Cult Store Inspired Category Bar directly above Hero ─── */}
              <nav aria-label="Department category shortcuts" className="mb-4 -mx-4 sm:-mx-6 lg:-mx-8 border-b border-white/[.06] bg-[#0c0c12]/80 backdrop-blur px-4 py-2 sm:px-6 lg:px-8 overflow-x-auto [scrollbar-width:none]">
                <div className="flex items-center justify-start lg:justify-center gap-3 sm:gap-4 min-w-max">
                  {/* All Gear with Icon */}
                  <button
                    onClick={() => { setSearchParams({}); }}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all text-xs font-semibold ${
                      !category ? 'border-brand bg-brand/15 text-brand-light shadow-glow' : 'border-white/10 text-text-secondary hover:text-white hover:border-white/20'
                    }`}
                  >
                    <div className="h-6 w-6 rounded-full bg-brand/20 grid place-items-center flex-none">
                      <Sparkles size={12} className="text-brand-light" />
                    </div>
                    <span>All Gear</span>
                  </button>

                  {/* Primary Categories with Circular Image Thumbnails */}
                  {(categories.length > 0 ? categories : DEFAULT_STORE_CATEGORIES).slice(0, 9).map(c => {
                    const active = category === c.slug;
                    return (
                      <button
                        key={c.id || c.slug}
                        onClick={() => setFilter('category', active ? '' : c.slug)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all text-xs font-semibold whitespace-nowrap ${
                          active
                            ? 'border-brand bg-brand/15 text-brand-light shadow-glow'
                            : 'border-white/10 text-text-secondary hover:text-white hover:border-white/20'
                        }`}
                      >
                        <div className="h-6 w-6 rounded-full overflow-hidden bg-dark-card border border-white/20 flex-none shadow-sm">
                          <img
                            src={getCategoryImageUrl(c)}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getCategoryFallbackAsset(c.slug);
                            }}
                          />
                        </div>
                        <span>{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </nav>

              {/* 1. Moving Hero Banner Carousel (Cult Store Reference with Previous/Next Arrows) */}
              <HeroBannerCarousel
                onSelectCategory={(slugTarget) => {
                  if (slugTarget) setFilter('category', slugTarget);
                  document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                }}
              />

              {/* 2. Brand Value Highlights */}
              <section className="mb-12 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: ShieldCheck, title: 'Price & Stock Verified', desc: 'Real-time stock validation at every checkout.' },
                  { icon: Dumbbell, title: 'Athlete Tested Gear', desc: 'Crafted for high-intensity training sessions.' },
                  { icon: Truck, title: 'Reliable Fast Shipping', desc: 'Direct dispatch with verified order tracking.' },
                  { icon: Sparkles, title: 'AI Fitness Synergies', desc: 'Matched to your personalized workout plans.' },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="flex items-center gap-3.5 rounded-2xl border border-white/[.06] bg-[#101016]/80 p-4 transition hover:border-white/15">
                    <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-brand/10 text-brand-light">
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-white">{title}</h3>
                      <p className="mt-0.5 text-[11px] text-text-muted leading-tight">{desc}</p>
                    </div>
                  </div>
                ))}
              </section>

              {/* 3. Shop by Category (Editorial Visual Grid with Full Images) */}
              <section className="mb-14">
                <div className="mb-6 flex items-end justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-light">DISCOVER</p>
                    <h2 className="mt-1 text-2xl sm:text-3xl font-black text-white tracking-tight">Shop by Category</h2>
                  </div>
                  <button
                    onClick={() => { setSearchParams({}); }}
                    className="text-xs font-bold text-brand-light hover:text-white flex items-center gap-1 cursor-pointer"
                  >
                    All Categories <ChevronRight size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-6">
                  {(categories.length > 0 ? categories : DEFAULT_STORE_CATEGORIES).map((c) => {
                    const imageUrl = getCategoryImageUrl(c);
                    const tag = CATEGORY_VISUALS[c.slug]?.tag || 'Fitness Gear';

                    return (
                      <button
                        key={c.id || c.slug}
                        onClick={() => {
                          setFilter('category', c.slug);
                          document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="group relative aspect-[3/4] overflow-hidden rounded-3xl bg-[#121218] border border-white/[.08] text-left transition-all duration-300 hover:border-brand/60 hover:shadow-[0_8px_30px_rgba(249,115,22,0.2)] hover:scale-[1.02] cursor-pointer"
                      >
                        {/* Category Photograph */}
                        <img
                          src={imageUrl}
                          alt={c.name}
                          loading="lazy"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = getCategoryFallbackAsset(c.slug);
                          }}
                          className="h-full w-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-110"
                        />

                        {/* Visual Gradient Overlay for pristine text readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />
                        <div className="absolute inset-0 bg-brand/5 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                        {/* Top Category Tag */}
                        <div className="absolute top-3 left-3">
                          <span className="rounded-full bg-black/60 px-2.5 py-1 text-[9px] font-bold tracking-wider text-white/90 backdrop-blur-md uppercase border border-white/10">
                            {tag}
                          </span>
                        </div>

                        {/* Bottom Information */}
                        <div className="absolute bottom-0 inset-x-0 p-4 flex flex-col justify-end">
                          <h3 className="text-sm sm:text-base font-black text-white leading-tight uppercase tracking-tight group-hover:text-brand-light transition-colors drop-shadow-md">
                            {c.name}
                          </h3>
                          <div className="mt-1 flex items-center justify-between text-[11px] text-white/70">
                            <span>{c.product_count ? `${c.product_count} Products` : 'Shop Collection'}</span>
                            <span className="flex items-center gap-1 font-bold text-brand-light opacity-0 -translate-x-2 transition-all duration-300 group-hover:opacity-100 group-hover:translate-x-0">
                              Explore <ArrowRight size={13} />
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 4. Featured Picks Collection Rail */}
              {featuredLoaded && featuredProducts.length > 0 && (
                <Rail
                  title="Featured Picks"
                  subtitle="Curated by the FORTIS training team for peak performance"
                  onViewAll={() => {
                    setFilter('sort', 'recommended');
                    document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  {featuredProducts.map(p =>
                    card(p, 'w-[48vw] max-w-[240px] flex-none snap-start sm:w-[220px] lg:w-[240px]')
                  )}
                </Rail>
              )}

              {/* 5. Campaign Promo Banner (Cult Store Merchandising Style) */}
              <section className="relative my-14 overflow-hidden rounded-3xl border border-white/[.08] bg-gradient-to-r from-[#0d0d14] via-[#141220] to-[#0f0e15] p-6 sm:p-10 lg:p-12 shadow-xl">
                <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_center,rgba(249,115,22,0.15),transparent_70%)]" aria-hidden="true" />
                <div className="relative z-10 max-w-xl">
                  <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-brand-light">
                    <Flame size={13} />
                    <span>TRAIN ANYWHERE</span>
                  </div>
                  <h2 className="mt-2 text-2xl sm:text-4xl font-black text-white tracking-tight uppercase">
                    YOUR HOME. YOUR ARENA.
                  </h2>
                  <p className="mt-3 text-xs sm:text-sm text-text-secondary leading-relaxed">
                    Transform your training routine with heavy-duty resistance bands, adjustable weights, and recovery mobility gear.
                  </p>
                  <button
                    onClick={() => {
                      const gymCat = categories.find(c => c.slug.includes('home') || c.slug.includes('gym') || c.slug.includes('equipment')) || categories[0];
                      if (gymCat) setFilter('category', gymCat.slug);
                      document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="fortis-btn-primary mt-6 inline-flex items-center gap-2 text-xs font-bold"
                  >
                    Shop Equipment <ArrowRight size={14} />
                  </button>
                </div>
              </section>

              {/* 6. Recently Viewed Rail */}
              {recent.length > 0 && (
                <Rail title="Recently Viewed" subtitle="Jump right back to items you browsed">
                  {recent.slice(0, 8).map(p =>
                    card(p, 'w-[48vw] max-w-[240px] flex-none snap-start sm:w-[220px] lg:w-[240px]')
                  )}
                </Rail>
              )}
            </>
          )}

          {/* ─── Main Catalog Listing ─── */}
          <section id="catalog" className="scroll-mt-32 pt-4">
            {catalog.items.some(p => p.demo_only) && (
              <div className="mb-6 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs leading-5 text-amber-200 flex items-center gap-3">
                <CircleAlert size={16} className="flex-none text-amber-400" />
                <span>Sample preview items shown in demonstration mode. Connect live catalog data for production fulfillment.</span>
              </div>
            )}

            {/* Catalog Subheader with Search & Active Title */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-white/[.07] pb-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {showSaved ? 'Saved Items' : q ? `Results for “${q}”` : category ? categoryLabel(categories, category) : 'All Training Products'}
                </h2>
                <p className="mt-0.5 text-xs text-text-muted" aria-live="polite">
                  {showSaved ? `${saved.length} items saved` : loadingCatalog ? 'Checking catalog…' : `${catalog.total} ${catalog.total === 1 ? 'product' : 'products'} available`}
                </p>
              </div>

              {!showSaved && (
                <label className="relative w-full sm:w-80">
                  <Search size={15} className="absolute left-3.5 top-3 text-text-muted" />
                  <input
                    id="catalog-search"
                    className="fortis-input h-10 w-full pl-9 pr-8 text-xs sm:text-sm bg-[#121218] border-white/10 rounded-xl focus:border-brand"
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    placeholder="Search gear, brand, or tag..."
                    aria-label="Search products"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => { setSearchText(''); setFilter('q', ''); }}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center text-text-muted hover:text-white"
                    >
                      <X size={13} />
                    </button>
                  )}
                </label>
              )}
            </div>

            {/* Filter & Sort Bar */}
            {!showSaved && (
              <div className="sticky z-20 -mx-4 mb-6 border-b border-white/[.06] bg-[#0a0a0f]/95 px-4 py-2.5 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8" style={{ top: headerH }}>
                <div className="flex items-center justify-between gap-3">
                  {/* Category Pills Strip */}
                  <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                    <button
                      onClick={() => setFilter('category', '')}
                      className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
                        !category ? 'bg-brand text-white' : 'bg-white/[.04] text-text-secondary hover:bg-white/[.08]'
                      }`}
                    >
                      All
                    </button>
                    {categories.slice(0, 8).map(c => (
                      <button
                        key={c.id}
                        onClick={() => setFilter('category', category === c.slug ? '' : c.slug)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
                          category === c.slug ? 'bg-brand text-white' : 'bg-white/[.04] text-text-secondary hover:bg-white/[.08]'
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>

                  {/* Refine Controls Desktop */}
                  <div className="hidden sm:flex items-center gap-2 ml-auto">
                    <button
                      onClick={() => setFilter('available', available ? '' : 'true')}
                      aria-pressed={available}
                      className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition ${
                        available ? 'border-brand bg-brand/10 text-brand-light' : 'border-white/10 text-text-secondary hover:border-white/20'
                      }`}
                    >
                      <SlidersHorizontal size={13} /> In Stock
                    </button>
                    <select
                      className="fortis-input h-9 w-auto min-w-44 py-0 text-xs bg-[#121218] border-white/10 rounded-xl"
                      value={sort}
                      onChange={e => setFilter('sort', e.target.value)}
                      aria-label="Sort products"
                    >
                      <option value="recommended">Featured / Recommended</option>
                      <option value="price_asc">Price: Low to High</option>
                      <option value="price_desc">Price: High to Low</option>
                      <option value="newest">Newest First</option>
                      <option value="name">Name (A-Z)</option>
                    </select>
                  </div>

                  {/* Mobile Refine Toggle */}
                  <div className="flex w-full items-center justify-between sm:hidden">
                    <button
                      onClick={() => setShowMobileFilters(open => !open)}
                      aria-expanded={showMobileFilters}
                      className="flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 text-xs font-semibold text-text-secondary"
                    >
                      <SlidersHorizontal size={13} /> Filters
                      {(available || sort !== 'recommended' || category) && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    </button>
                    <select
                      className="fortis-input h-9 w-auto max-w-[170px] py-0 text-xs bg-[#121218] border-white/10 rounded-xl"
                      value={sort}
                      onChange={e => setFilter('sort', e.target.value)}
                      aria-label="Sort products"
                    >
                      <option value="recommended">Recommended</option>
                      <option value="price_asc">Price: Low</option>
                      <option value="price_desc">Price: High</option>
                      <option value="newest">Newest</option>
                    </select>
                  </div>
                </div>

                {/* Mobile Filter Drawer / Collapsible */}
                {showMobileFilters && (
                  <div className="mt-3 space-y-2 border-t border-white/[.06] pt-3 sm:hidden">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-text-secondary font-medium">Availability</span>
                      <button
                        onClick={() => setFilter('available', available ? '' : 'true')}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          available ? 'border-brand bg-brand/10 text-brand-light' : 'border-white/10 text-text-secondary'
                        }`}
                      >
                        {available ? 'In Stock Only' : 'All Items'}
                      </button>
                    </div>
                    <div className="pt-2">
                      <span className="text-xs text-text-secondary font-medium block mb-1.5">Categories</span>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => setFilter('category', '')}
                          className={`rounded-full px-2.5 py-1 text-[11px] ${!category ? 'bg-brand text-white' : 'bg-white/5 text-text-muted'}`}
                        >
                          All
                        </button>
                        {categories.map(c => (
                          <button
                            key={c.id}
                            onClick={() => setFilter('category', category === c.slug ? '' : c.slug)}
                            className={`rounded-full px-2.5 py-1 text-[11px] ${category === c.slug ? 'bg-brand text-white' : 'bg-white/5 text-text-muted'}`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Active Filter Badges */}
            {activeFilters.length > 0 && !showSaved && (
              <div className="mb-6 flex flex-wrap items-center gap-2 text-xs">
                {activeFilters.map(f => (
                  <button
                    key={f.k}
                    onClick={() => setFilter(f.k, '')}
                    className="flex items-center gap-1.5 rounded-full bg-white/[.08] px-3 py-1 font-semibold text-text-primary hover:bg-white/15"
                  >
                    <span>{f.label}</span>
                    <X size={12} />
                  </button>
                ))}
                <button
                  onClick={() => setSearchParams({})}
                  className="text-xs font-bold text-brand-light underline ml-1 hover:text-white"
                >
                  Clear All
                </button>
              </div>
            )}

            {/* Product Cards Grid */}
            {loadingCatalog && !showSaved ? (
              <ProductSkeletons />
            ) : list.length ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
                {list.map(p => card(p))}
              </div>
            ) : (
              <div className="rounded-3xl border border-white/[.07] bg-white/[.02] px-6 py-20 text-center">
                {showSaved ? (
                  <Heart className="mx-auto mb-3 h-10 w-10 text-text-muted" />
                ) : (
                  <Package className="mx-auto mb-3 h-10 w-10 text-text-muted" />
                )}
                <h3 className="text-lg font-bold text-white">
                  {showSaved ? 'No Saved Items Yet' : error ? 'Catalog Currently Unavailable' : 'No Products Found'}
                </h3>
                <p className="mt-1 text-xs text-text-muted max-w-sm mx-auto">
                  {showSaved
                    ? 'Click the heart icon on any product to save it here for later.'
                    : error
                      ? 'Please try refreshing the page or clearing active filters.'
                      : 'Try refining your search keyword or selecting a different category.'}
                </p>
                <button
                  onClick={() => error ? setCatalogRetry(r => r + 1) : setSearchParams({})}
                  className="fortis-btn-primary mt-6 inline-flex text-xs"
                >
                  {showSaved ? 'Browse All Gear' : error ? 'Retry' : 'Reset Filters'}
                </button>
              </div>
            )}

            {/* Pagination Controls */}
            {!showSaved && catalog.pages > 1 && (
              <div className="mt-12 flex items-center justify-center gap-4">
                <button
                  disabled={page <= 1}
                  onClick={() => setFilter('page', String(page - 1))}
                  className="fortis-btn-secondary disabled:opacity-40 text-xs px-4 py-2"
                >
                  Previous
                </button>
                <span className="text-xs font-medium text-text-muted">
                  Page {page} of {catalog.pages}
                </span>
                <button
                  disabled={page >= catalog.pages}
                  onClick={() => setFilter('page', String(page + 1))}
                  className="fortis-btn-secondary disabled:opacity-40 text-xs px-4 py-2"
                >
                  Next
                </button>
              </div>
            )}
          </section>

          {/* ─── Premium Store Footer (Only on Landing) ─── */}
          {landing && (
            <footer className="mt-24 border-t border-white/[.07] pt-12 pb-16">
              <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
                {/* Brand Overview */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <img src="/fortis-mark.png" alt="FORTIS" className="h-8 w-8 object-contain" />
                    <span className="text-sm font-black tracking-widest text-white">
                      FORTIS <span className="text-brand-light">STORE</span>
                    </span>
                  </div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    High-performance fitness activewear, heavy-duty resistance equipment, and sports nutrition engineered to elevate every training rep.
                  </p>
                </div>

                {/* Categories */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Shop Categories</h4>
                  <ul className="space-y-2 text-xs text-text-secondary">
                    {categories.slice(0, 6).map(c => (
                      <li key={c.id}>
                        <button
                          onClick={() => {
                            setFilter('category', c.slug);
                            document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="hover:text-brand-light transition text-left"
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Account & Orders */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Account & Orders</h4>
                  <ul className="space-y-2 text-xs text-text-secondary">
                    {user ? (
                      <>
                        <li><Link to="/store/orders" className="hover:text-white transition">My Orders</Link></li>
                        <li><Link to="/store?saved=1" className="hover:text-white transition">Saved Items ({saved.length})</Link></li>
                        <li><Link to="/dashboard" className="hover:text-white transition">Fitness Dashboard</Link></li>
                      </>
                    ) : (
                      <>
                        <li><Link to="/auth/login" className="hover:text-white transition">Sign In</Link></li>
                        <li><Link to="/store?saved=1" className="hover:text-white transition">Guest Wishlist</Link></li>
                      </>
                    )}
                  </ul>
                </div>

                {/* Trust & Guarantees */}
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Customer Guarantee</h4>
                  <ul className="space-y-2 text-xs text-text-muted leading-relaxed">
                    <li>✓ Prices and stock live-verified at checkout</li>
                    <li>✓ Direct dispatch of athlete-tested gear</li>
                    <li>✓ Powered by the FORTIS AI fitness ecosystem</li>
                  </ul>
                </div>
              </div>

              <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/[.06] pt-6 text-[11px] text-text-muted">
                <p>© {new Date().getFullYear()} FORTIS AI Fitness. All rights reserved.</p>
                <p className="tracking-wide">Train with purpose. Perform without compromise.</p>
              </div>
            </footer>
          )}
        </>
      )}

      {/* ─── Product Details Page ─── */}
      {isProduct && (
        product ? (
          <ProductDetail
            product={product}
            categories={categories}
            related={related}
            recent={recent.filter(r => r.id !== product.id)}
            busy={busyId === product.id}
            saved={isSaved(product)}
            onSave={toggleSaved}
            onAdd={(qty, variantId) => addToCart(product, qty, true, variantId)}
            onBuy={async (qty, variantId) => { if (await addToCart(product, qty, false, variantId)) goCheckout(); }}
            setToast={setToast}
            card={card}
          />
        ) : productLoadFailed ? (
          <div className="rounded-3xl border border-white/[.08] py-20 text-center">
            <Package className="mx-auto mb-3 h-10 w-10 text-text-muted" />
            <h1 className="text-lg font-bold text-white">Product Unavailable</h1>
            <p className="mt-1 text-xs text-text-muted">This product may have been discontinued or removed from the catalog.</p>
            <Link to="/store" className="mt-5 inline-flex items-center gap-1.5 text-xs font-bold text-brand-light hover:underline">
              <ArrowRight size={14} className="rotate-180" /> Back to Store
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-2">
            <Skeleton className="aspect-square !rounded-3xl" />
            <div className="space-y-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-3/4" />
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        )
      )}

      {/* ─── Detailed Cart Page ─── */}
      {isCart && (
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <section>
            <h1 className="mb-6 text-2xl font-black text-white">
              Your Bag <span className="text-sm font-normal text-text-muted">({count} {count === 1 ? 'item' : 'items'})</span>
            </h1>
            {cart.items.length === 0 ? (
              <div className="rounded-3xl border border-white/[.07] py-20 text-center">
                <ShoppingBag className="mx-auto h-10 w-10 text-text-muted" />
                <p className="mt-4 font-bold text-white">Your bag is empty.</p>
                <Link to="/store" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-brand-light hover:underline">
                  Continue Shopping <ArrowRight size={14} />
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-white/[.07] rounded-3xl border border-white/[.08] bg-[#0c0c12] px-6">
                {cart.items.map(i => (
                  <li key={i.item_id} className="flex gap-4 py-5">
                    <Link to={`/store/product/${i.product.slug}`} className="h-24 w-24 flex-none overflow-hidden rounded-2xl bg-dark-card border border-white/5">
                      {i.product.image ? (
                        <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Package className="m-8 text-text-muted" />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-3">
                        <div>
                          <Link to={`/store/product/${i.product.slug}`} className="font-bold text-sm text-white hover:text-brand-light transition">
                            {i.product.name}
                          </Link>
                          {i.variant_name && <small className="mt-1 block text-xs text-text-muted">{i.variant_name}</small>}
                        </div>
                        <b className="flex-none font-black text-white">{inr(i.line_total_paise)}</b>
                      </div>
                      <p className="mt-1 text-xs text-text-secondary">{inr(i.unit_price_paise)} each</p>
                      <p className={`mt-1 text-xs ${i.available ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {i.available ? 'In Stock' : 'Availability changed'}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex items-center rounded-xl border border-white/10 bg-white/[.03]">
                          <button aria-label="Decrease quantity" onClick={() => i.quantity > 1 ? updateQty(i.item_id, i.quantity - 1) : remove(i.item_id)} className="grid h-8 w-8 place-items-center hover:bg-white/10 rounded-l-xl">
                            <Minus size={13} />
                          </button>
                          <span className="w-7 text-center text-xs font-bold">{i.quantity}</span>
                          <button aria-label="Increase quantity" onClick={() => updateQty(i.item_id, i.quantity + 1)} disabled={i.quantity >= (i.variant_stock_quantity ?? i.product.stock_quantity)} className="grid h-8 w-8 place-items-center hover:bg-white/10 rounded-r-xl disabled:opacity-30">
                            <Plus size={13} />
                          </button>
                        </div>
                        <button onClick={() => remove(i.item_id)} className="ml-auto flex items-center gap-1 text-xs text-text-muted hover:text-red-400 transition">
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <aside className="h-fit rounded-3xl border border-white/[.08] bg-[#0c0c12] p-6 lg:sticky lg:top-24">
            <h2 className="font-black text-lg text-white">Order Summary</h2>
            <div className="mt-5 flex justify-between text-xs text-text-secondary">
              <span>Subtotal</span>
              <span className="font-semibold text-white">{inr(cart.subtotal_paise)}</span>
            </div>
            <div className="mt-3 flex justify-between text-xs text-text-secondary">
              <span>Standard Shipping</span>
              <span className="text-emerald-400 font-semibold">Free</span>
            </div>
            <div className="my-5 border-t border-white/10" />
            <div className="flex justify-between font-extrabold text-base text-white">
              <span>Total</span>
              <span>{inr(cart.total_paise)}</span>
            </div>
            <button onClick={goCheckout} disabled={!cart.items.length} className="fortis-btn-primary mt-6 w-full py-3 text-sm font-bold shadow-glow">
              Continue to Checkout
            </button>
            <p className="mt-3 text-center text-[10px] text-text-muted leading-normal">
              Final price and stock are verified at order placement.
            </p>
          </aside>
        </div>
      )}

      {/* ─── Checkout Page ─── */}
      {isCheckout && (
        <Checkout cart={cart} setError={setError} setPreview={setPreview} preview={preview} navigate={navigate} authenticated={authenticated} defaultName={user?.name || ''} />
      )}

      {/* ─── Orders List & Detail ─── */}
      {isOrders && !orderId && (
        <section className="mx-auto max-w-3xl">
          <h1 className="mb-6 text-2xl font-black text-white">Your Orders</h1>
          {orders.length ? (
            <div className="space-y-3">
              {orders.map(o => (
                <Link key={o.id} to={`/store/orders/${o.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.08] bg-[#0c0c12] p-4 transition hover:border-brand/40">
                  <div>
                    <b className="text-sm font-bold text-white">{o.order_number}</b>
                    <p className="mt-1 text-xs text-text-muted">
                      {new Date(o.created_at).toLocaleDateString('en-IN')} · {o.items?.length || 0} {(o.items?.length || 0) === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <div className="text-right">
                    <b className="text-sm font-extrabold text-white">{inr(o.grand_total_paise)}</b>
                    <div className="mt-1.5 flex justify-end gap-1.5 text-[10px] font-semibold">
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-0.5 text-amber-300">
                        {String(o.payment_status).replace('_', ' ')}
                      </span>
                      <span className="rounded-full bg-white/[.07] px-2.5 py-0.5 text-text-secondary uppercase">
                        {String(o.order_status || '').replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-white/[.07] py-16 text-center text-xs text-text-muted">
              No orders found yet.
              <div className="mt-4">
                <Link to="/store" className="fortis-btn-primary inline-flex text-xs">
                  Discover Gear
                </Link>
              </div>
            </div>
          )}
        </section>
      )}

      {orderId && <OrderConfirmation order={order} error={error} setToast={setToast} />}

      {/* ─── Overlays & Drawers ─── */}
      <CartDrawer open={drawer} onClose={() => setDrawer(false)} cart={cart} count={count} onQty={updateQty} onRemove={remove} onCheckout={goCheckout} />
      <QuickView product={quick} categories={categories} onClose={() => setQuick(null)} onAdd={p => addToCart(p)} busy={!!quick && busyId === quick.id} />

      {/* Floating Toast Notification */}
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4 transition-all duration-300 md:bottom-8 ${
          isProduct ? 'bottom-[calc(132px+env(safe-area-inset-bottom))]' : 'bottom-20'
        } ${toast ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
      >
        {toast && (
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#161620] px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md">
            <Check size={14} className="text-emerald-400" />
            <span>{toast}</span>
          </div>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar — fixed height so the sticky buy bar can sit flush on top of it */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-14 border-t border-white/[.08] bg-[#0a0a0f]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden" aria-label="Store navigation">
        {navItem('/store', 'Shop', <Home size={18} />, path === '/store' && !showSaved)}
        {navItem('/store?saved=1', 'Saved', <Heart size={18} />, showSaved)}
        <button onClick={() => setDrawer(true)} className="relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold text-text-muted hover:text-white transition">
          <ShoppingBag size={18} />
          <span>Bag</span>
          {count > 0 && (
            <span className="absolute right-[calc(50%-18px)] top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand px-1 text-[9px] font-bold text-white">
              {count}
            </span>
          )}
        </button>
        {navItem('/store/orders', 'Orders', <Package size={18} />, isOrders || !!orderId)}
      </nav>
    </div>
  );
}

/* ─────────────────────────── product detail ─────────────────────────── */

function ProductDetail({
  product, categories, related, recent, busy, saved, onSave, onAdd, onBuy, setToast, card
}: {
  product: StoreProduct; categories: StoreCategory[]; related: StoreProduct[]; recent: StoreProduct[];
  busy: boolean; saved: boolean; onSave: (p: StoreProduct) => void;
  onAdd: (qty: number, variantId?: string) => void; onBuy: (qty: number, variantId?: string) => void;
  setToast: (s: string) => void; card: (p: StoreProduct, c?: string) => React.ReactNode;
}) {
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState('');
  useEffect(() => { setQty(1); setVariantId(''); }, [product.id, product.variants]);

  const selectedVariant = product.variants?.find(v => v.id === variantId);
  const currentStock = selectedVariant?.stock_quantity ?? (product.variants?.length ? 0 : product.stock_quantity);
  const currentPrice = selectedVariant?.price_paise ?? product.price_paise;
  const stock = stockInfo(currentStock);
  const max = Math.max(currentStock, 1);
  const specs = product.specifications ? Object.entries(product.specifications) : [];

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: product.name, url });
      else { await navigator.clipboard.writeText(url); setToast('Product link copied'); }
    } catch { /* cancelled */ }
  };

  const Acc = ({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) => (
    <details open={open} className="group border-b border-white/[.08] py-4">
      <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-bold uppercase tracking-wider text-white">
        <span>{title}</span>
        <ChevronDown size={15} className="text-text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-3 text-xs leading-relaxed text-text-secondary">{children}</div>
    </details>
  );

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
        {/* Product Media Display */}
        <div className="relative aspect-[4/4.2] sm:aspect-square overflow-hidden rounded-3xl bg-dark-card border border-white/[.08]">
          {product.image ? (
            <img src={productImageSrc(product.image)} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center bg-radial-orange">
              <Package className="h-20 w-20 text-white/20" />
            </div>
          )}
          <div className="absolute right-4 top-4 flex flex-col gap-2">
            <button
              onClick={() => onSave(product)}
              aria-pressed={saved}
              aria-label={saved ? 'Remove from saved' : 'Save for later'}
              className="grid h-10 w-10 place-items-center rounded-full bg-black/70 backdrop-blur transition hover:scale-110 active:scale-90"
            >
              <Heart size={17} className={saved ? 'fill-brand text-brand' : 'text-white'} />
            </button>
            <button
              onClick={share}
              aria-label="Share product"
              className="grid h-10 w-10 place-items-center rounded-full bg-black/70 backdrop-blur transition hover:scale-110 active:scale-90"
            >
              <Share2 size={17} className="text-white" />
            </button>
          </div>
        </div>

        {/* Product Purchase & Specification Details */}
        <div className="flex flex-col">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-brand-light">
            {categoryLabel(categories, product.category_id)}
          </p>
          <h1 className="mt-2 text-2xl sm:text-4xl font-black leading-tight text-white">{product.name}</h1>
          {(product.brand || product.sku) && (
            <p className="mt-2 text-xs text-text-muted font-medium">
              {product.brand}{product.brand && product.sku ? ' · ' : ''}{product.sku && `SKU: ${product.sku}`}
            </p>
          )}

          {/* Variants selector */}
          {product.variants?.length ? (
            <label className="mt-6 block text-xs font-bold text-white/80">
              Select Option / Size
              <select
                value={variantId}
                onChange={e => { setVariantId(e.target.value); setQty(1); }}
                className="fortis-input mt-2 bg-[#121218] border-white/10 rounded-xl"
              >
                <option value="">Select an option</option>
                {product.variants.map(v => (
                  <option key={v.id} value={v.id} disabled={!v.stock_quantity}>
                    {v.name} · {v.stock_quantity ? `${v.stock_quantity} available` : 'Sold out'}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-6 flex items-baseline gap-3">
            <span className="text-3xl font-black text-white">
              {product.variants?.length && !selectedVariant ? `From ${inr(product.price_paise)}` : inr(currentPrice)}
            </span>
          </div>

          {product.variants?.length && !selectedVariant ? (
            <p className="mt-2 text-xs text-text-muted">Choose an option above to check availability.</p>
          ) : currentStock > 0 ? (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium">
              <span className={`h-2 w-2 rounded-full ${stock.dot}`} />
              <span className={stock.text}>{stock.label}</span>
              {selectedVariant && (
                <span className="text-xs text-white/45">
                  ({Object.entries(selectedVariant.attributes || {}).map(([k, v]) => `${k}: ${v}`).join(' · ')})
                </span>
              )}
            </div>
          ) : (
            <div className="mt-3 flex items-center gap-2 text-xs font-medium text-red-400">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span>Currently Sold Out</span>
            </div>
          )}

          {/* Quantity Controls */}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-white/10 bg-[#121218]">
              <button
                aria-label="Decrease quantity"
                onClick={() => setQty(q => Math.max(1, q - 1))}
                disabled={qty <= 1}
                className="grid h-11 w-11 place-items-center hover:bg-white/10 rounded-l-xl disabled:opacity-30"
              >
                <Minus size={15} />
              </button>
              <span className="w-8 text-center text-sm font-bold text-white" aria-live="polite">{qty}</span>
              <button
                aria-label="Increase quantity"
                onClick={() => setQty(q => Math.min(max, q + 1))}
                disabled={qty >= max || !currentStock}
                className="grid h-11 w-11 place-items-center hover:bg-white/10 rounded-r-xl disabled:opacity-30"
              >
                <Plus size={15} />
              </button>
            </div>
            {!product.demo_only && (
              <p className="text-xs text-text-secondary">
                Subtotal: <b className="text-white font-bold">{inr(currentPrice * qty)}</b>
              </p>
            )}
          </div>

          {/* Action CTAs Desktop */}
          <div className="mt-6 hidden gap-3 sm:flex">
            <button
              disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)}
              onClick={() => onAdd(qty, variantId || undefined)}
              className="fortis-btn-primary flex-1 py-3 text-xs font-bold shadow-glow"
            >
              {busy ? 'Adding…' : 'Add to Bag'}
            </button>
            <button
              onClick={() => onBuy(qty, variantId || undefined)}
              disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)}
              className="fortis-btn-secondary py-3 text-xs font-bold"
            >
              Buy Now
            </button>
          </div>

          {/* Description & Collapsible Specifications */}
          <div className="mt-8 border-t border-white/[.08]">
            <Acc title="Product Overview" open>
              <p className="whitespace-pre-line leading-relaxed">
                {product.description || 'Precision activewear and fitness equipment designed to support your athletic performance and everyday training.'}
              </p>
            </Acc>
            {specs.length > 0 && (
              <Acc title="Specifications & Materials">
                <dl className="grid grid-cols-2 gap-2">
                  {specs.map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-white/[.03] p-3 border border-white/5">
                      <dt className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{k}</dt>
                      <dd className="mt-0.5 text-xs font-bold text-white">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </Acc>
            )}
            <Acc title="Shipping & Returns Policy">
              <p className="leading-relaxed text-xs">
                Every order undergoes backend inventory validation prior to placement. All returns within 14 days are eligible for exchange or store credit in accordance with FORTIS policies.
              </p>
            </Acc>
          </div>
        </div>
      </div>

      {/* Related Products Rail */}
      {related.length > 0 && (
        <div className="mt-16">
          <Rail title="You May Also Like" subtitle={`More from ${categoryLabel(categories, product.category_id)}`}>
            {related.map(p => card(p, 'w-[48vw] max-w-[240px] flex-none snap-start sm:w-[220px] lg:w-[240px]'))}
          </Rail>
        </div>
      )}

      {/* Sticky Mobile Buy Bar */}
      {!product.demo_only && (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-30 flex items-center gap-3 border-t border-white/[.08] bg-[#0a0a0f]/95 px-4 py-3 backdrop-blur-xl sm:hidden">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-medium text-text-muted">{product.name}</p>
            <b className="text-sm font-black text-white">{inr(currentPrice * qty)}</b>
          </div>
          <button
            disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)}
            onClick={() => onAdd(qty, variantId || undefined)}
            className="fortis-btn-secondary px-4 py-2 text-xs font-bold"
          >
            Add
          </button>
          <button
            disabled={!currentStock || product.demo_only || busy || (!!product.variants?.length && !selectedVariant)}
            onClick={() => onBuy(qty, variantId || undefined)}
            className="fortis-btn-primary px-4 py-2 text-xs font-bold shadow-glow"
          >
            Buy Now
          </button>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── checkout ─────────────────────────── */

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

function Checkout({
  cart, setError, setPreview, preview, navigate, authenticated, defaultName
}: {
  cart: CartSummary; setError: (s: string) => void; setPreview: (o: any) => void; preview: any; navigate: (to: string) => void; authenticated: boolean; defaultName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [address, setAddress] = useState<Record<string, string>>({ name: defaultName, phone: '', line1: '', line2: '', city: '', state: '', postal_code: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showItems, setShowItems] = useState(false);
  const [idempotencyKey] = useState(createIdempotencyKey);

  useEffect(() => {
    if (authenticated) {
      storeApi.preview().then(setPreview).catch(e => setError(e.response?.data?.detail || 'Could not calculate checkout total.'));
    }
  }, [authenticated, setPreview, setError]);

  const change = (e: ChangeEvent<HTMLInputElement>) => setAddress({ ...address, [e.target.name]: e.target.value });
  const errors = Object.fromEntries(FIELDS.map(f => [f.key, validate(f.key, address[f.key])]));
  const valid = FIELDS.every(f => (f.optional || address[f.key].trim()) && !errors[f.key]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(Object.fromEntries(FIELDS.map(f => [f.key, true])));
    if (!valid) return;
    setLoading(true);
    setError('');
    try {
      const o = await storeApi.checkout(address, idempotencyKey);
      navigate(`/store/orders/${o.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not place order. Please review your details.');
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="py-20 text-center">
        <h1 className="text-2xl font-black text-white">Sign In to Checkout</h1>
        <p className="mt-2 text-xs text-text-muted">Your guest bag will be synced to your account.</p>
        <Link to="/auth/login" className="fortis-btn-primary mt-6 inline-block text-xs font-bold shadow-glow">
          Sign In
        </Link>
      </div>
    );
  }

  const total = preview?.total_paise ?? cart.total_paise;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} noValidate className="space-y-6">
        <ol className="flex items-center gap-2 text-xs" aria-label="Checkout progress">
          {['Bag', 'Delivery', 'Review'].map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-bold ${i < 2 ? 'bg-brand text-white' : 'bg-white/10 text-text-muted'}`}>
                {i === 0 ? <Check size={12} /> : i + 1}
              </span>
              <span className={i === 1 ? 'font-bold text-white' : 'text-text-muted'}>{s}</span>
              {i < 2 && <span className="h-px w-6 bg-white/15 sm:w-10" />}
            </li>
          ))}
        </ol>

        <div>
          <h1 className="text-2xl font-black text-white">Delivery Address</h1>
          <p className="mt-1 text-xs text-text-muted">Where should we deliver your fitness training gear?</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(f => {
            const err = touched[f.key] ? (f.optional ? '' : !address[f.key].trim() ? 'This field is required.' : errors[f.key]) : '';
            return (
              <label key={f.key} className={`fortis-label ${f.span ? 'sm:col-span-2' : ''}`}>
                {f.label}
                <input
                  name={f.key}
                  value={address[f.key]}
                  onChange={change}
                  onBlur={() => setTouched(t => ({ ...t, [f.key]: true }))}
                  type={f.type || 'text'}
                  inputMode={f.mode}
                  autoComplete={f.auto}
                  aria-invalid={!!err}
                  className={`fortis-input mt-1.5 h-11 text-xs sm:text-sm bg-[#121218] border-white/10 rounded-xl ${err ? '!border-red-500/60' : ''}`}
                />
                {err && <span className="mt-1 block text-[11px] text-red-400">{err}</span>}
              </label>
            );
          })}
        </div>

        <button disabled={loading || !cart.items.length} className="fortis-btn-primary w-full sm:w-auto px-8 py-3 text-sm font-bold shadow-glow">
          {loading ? 'Processing Order…' : 'Place Order'}
        </button>
      </form>

      <aside className="h-fit rounded-3xl border border-white/[.08] bg-[#0c0c12] p-6 lg:sticky lg:top-24">
        <h2 className="font-bold text-white">Order Summary</h2>
        <button
          type="button"
          onClick={() => setShowItems(s => !s)}
          className="mt-3 flex w-full items-center justify-between text-xs text-text-secondary lg:hidden"
          aria-expanded={showItems}
        >
          {cart.items.length} items <ChevronDown size={14} className={`transition-transform ${showItems ? 'rotate-180' : ''}`} />
        </button>
        <div className={`${showItems ? 'block' : 'hidden'} lg:block divide-y divide-white/5`}>
          {cart.items.map(i => (
            <div key={i.item_id} className="py-3 flex items-center gap-3 text-xs">
              <div className="h-10 w-10 flex-none overflow-hidden rounded-lg bg-dark-card border border-white/5">
                {i.product.image && <img src={productImageSrc(i.product.image)} alt="" className="h-full w-full object-cover" />}
              </div>
              <span className="min-w-0 flex-1 truncate text-text-secondary font-medium">
                {i.product.name}{i.variant_name ? ` · ${i.variant_name}` : ''} × {i.quantity}
              </span>
              <span className="font-bold text-white">{inr(i.line_total_paise)}</span>
            </div>
          ))}
        </div>
        <div className="my-4 border-t border-white/10" />
        <div className="flex justify-between text-xs text-text-secondary">
          <span>Subtotal</span>
          <span className="font-semibold text-white">{inr(preview?.subtotal_paise ?? cart.subtotal_paise)}</span>
        </div>
        <div className="mt-2 flex justify-between text-xs text-text-secondary">
          <span>Shipping</span>
          <span className="text-emerald-400 font-semibold">Free</span>
        </div>
        <div className="my-4 border-t border-white/10" />
        <div className="flex justify-between font-black text-sm text-white">
          <span>Total Amount</span>
          <span>{inr(total)}</span>
        </div>
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-[11px] leading-5 text-amber-200">
          <CircleAlert size={13} className="mr-1.5 inline text-amber-400" />
          No payment gateway is attached. This creates a confirmed unpaid order.
        </div>
        <p className="mt-3 text-[10px] text-text-muted">
          {preview?.message || 'Price & inventory verified by backend upon submission.'}
        </p>
      </aside>
    </div>
  );
}

/* ─────────────────────────── order confirmation ─────────────────────────── */

function OrderConfirmation({ order, error, setToast }: { order: any; error: string; setToast: (s: string) => void }) {
  if (!order) return <div className="py-20 text-center text-xs text-text-muted">{error || 'Loading order details…'}</div>;
  const status = String(order.order_status || 'placed').toLowerCase();
  const stepIndex = Math.max(0, ORDER_STEPS.indexOf(status));
  const copy = async () => {
    try { await navigator.clipboard.writeText(order.order_number); setToast('Order number copied'); }
    catch { /* ignore */ }
  };
  const a = order.shipping_address_snapshot;

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-white/[.08] bg-[#0c0c12] p-6 sm:p-10 shadow-2xl">
      <div className="text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand/10 text-brand-light">
          <Check size={28} />
        </div>
        <h1 className="mt-4 text-2xl sm:text-3xl font-black text-white">Order Confirmed</h1>
        <p className="mt-1.5 text-xs text-text-secondary">
          Thank you for ordering with FORTIS. Your training gear has been queued for dispatch.
        </p>
        <button
          onClick={copy}
          className="mx-auto mt-4 flex items-center gap-2 rounded-full border border-white/10 bg-white/[.03] px-4 py-2 text-xs font-bold text-white hover:border-brand/50 transition"
          aria-label={`Copy order number ${order.order_number}`}
        >
          <span>Order #{order.order_number}</span>
          <Copy size={13} className="text-text-muted" />
        </button>
      </div>

      <ol className="my-8 grid grid-cols-5 gap-1 text-center text-[10px] sm:text-xs" aria-label="Order progress">
        {ORDER_STEPS.map((s, i) => (
          <li key={s} className="relative">
            <div className={`mx-auto grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${i <= stepIndex ? 'bg-brand text-white shadow-glow' : 'bg-white/10 text-text-muted'}`}>
              {i < stepIndex ? <Check size={13} /> : i + 1}
            </div>
            <p className={`mt-1.5 capitalize font-semibold ${i <= stepIndex ? 'text-white' : 'text-text-muted'}`}>{s}</p>
          </li>
        ))}
      </ol>

      <div className="divide-y divide-white/[.08] rounded-2xl border border-white/[.08] bg-[#101016] px-4 text-left">
        {order.items?.map((i: any) => (
          <div key={i.product_id} className="flex justify-between gap-3 py-3 text-xs">
            <span className="min-w-0 truncate text-text-secondary">{i.name} × {i.quantity}</span>
            <b className="flex-none font-bold text-white">{inr(i.line_total_paise)}</b>
          </div>
        ))}
        <div className="flex justify-between py-3.5 text-sm font-black text-white">
          <span>Total Paid</span>
          <span>{inr(order.grand_total_paise)}</span>
        </div>
      </div>

      {a && (
        <div className="mt-6 text-left text-xs leading-relaxed text-text-muted rounded-2xl border border-white/5 bg-[#101016] p-4">
          <b className="text-white block mb-1">Shipping Address</b>
          <p>{a.name} · {a.phone}</p>
          <p>{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}, {a.state} {a.postal_code}</p>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Link to="/store/orders" className="fortis-btn-primary inline-flex items-center justify-center gap-2 text-xs font-bold">
          View My Orders <ArrowRight size={14} />
        </Link>
        <Link to="/store" className="fortis-btn-secondary inline-flex items-center justify-center gap-2 text-xs font-bold">
          <Sparkles size={14} /> Continue Shopping
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────── store admin export ─────────────────────────── */

export function StoreAdmin({
  categories, user, setError, setNotice
}: {
  categories: StoreCategory[]; user: any; setError: (s: string) => void; setNotice: (s: string) => void;
}) {
  const navigate = useNavigate();
  const { productId } = useParams();
  const location = useLocation();

  const emptyProduct = {
    name: '', brand: '', category_id: '', description: '', image: '',
    price: '', stock_quantity: '', sku: '', tags: '', specifications: '{}',
    variants: '[]', featured: false, active: true, demo_only: false
  };

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
      const result = await storeApi.adminProducts({
        search: productSearch, status: productStatus, stock: productStock,
        category: productCategory, page: productPage, limit: 20
      });
      setProducts(result.items);
      setProductPages(result.pages);
      setProductTotal(result.total);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not load products.');
    }
  }, [user?.is_admin, productSearch, productStatus, productStock, productCategory, productPage, setError]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  if (!user?.is_admin) {
    return (
      <div className="rounded-3xl border border-red-500/20 bg-red-500/5 p-8 text-center">
        <CircleAlert className="mx-auto text-red-400" />
        <h1 className="mt-3 text-lg font-bold text-white">Administrator Access Required</h1>
        <p className="mt-1 text-xs text-text-muted">Sign in with an admin profile to manage store catalog.</p>
        <Link to="/auth/login" className="fortis-btn-primary mt-5 inline-flex text-xs">Sign In</Link>
      </div>
    );
  }

  const resetProduct = () => {
    setProduct(emptyProduct);
    setEditingId('');
    if (location.pathname !== '/admin/products') navigate('/admin/products', { replace: true });
  };

  const createCategory = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const created = (await storeApi.createCategory({ name: categoryName })).data as StoreCategory;
      setCategoryOptions(current => [...current.filter(c => c.slug !== created.slug), created]);
      setCategoryName('');
      setNotice('Category saved successfully.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not save category.');
    } finally {
      setSaving(false);
    }
  };

  const saveProduct = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let specifications: Record<string, string>;
      try { specifications = JSON.parse(product.specifications || '{}'); }
      catch { throw new Error('Specifications must be valid JSON, e.g. {"Material":"Steel"}.'); }
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
      resetProduct();
      setNotice(wasEditing ? 'Product updated.' : 'Product added to the store.');
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  const editProduct = (item: StoreProduct) => {
    setEditingId(item.id);
    setProduct({
      name: item.name, brand: item.brand || '', category_id: item.category_id,
      description: item.description || '', image: item.image || '',
      price: (item.price_paise / 100).toFixed(2), stock_quantity: String(item.stock_quantity),
      sku: item.sku || '', tags: (item.tags || []).join(', '),
      specifications: JSON.stringify(item.specifications || {}, null, 2),
      variants: JSON.stringify(item.variants || [], null, 2),
      featured: !!item.featured, active: item.active !== false, demo_only: !!item.demo_only
    });
    document.getElementById('store-product-form')?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (location.pathname.endsWith('/new')) { setEditingId(''); setProduct(emptyProduct); }
    else if (productId) storeApi.adminProduct(productId).then(editProduct).catch((err: any) => setError(err.response?.data?.detail || 'Could not load this product.'));
  }, [productId, location.pathname]);

  const removeProduct = async (item: StoreProduct) => {
    if (!window.confirm(`Remove “${item.name}” from the store?`)) return;
    try {
      await storeApi.deleteProduct(item.id);
      await loadProducts();
      setNotice(`${item.name} removed from catalog.`);
      if (editingId === item.id) resetProduct();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not remove product.');
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const result = await storeApi.uploadProductImage(file);
      setProduct(current => ({ ...current, image: result.image }));
      setNotice('Product image uploaded.');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Could not upload this image.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <BrandLogo className="h-12 w-12 shrink-0 sm:h-14 sm:w-14" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-light">Store Administration</p>
            <h1 className="mt-1 text-2xl font-black text-white">Catalog Management</h1>
            <p className="mt-1 text-xs text-text-muted">Manage products, inventory, pricing, variants, and categories.</p>
          </div>
        </div>
        <Link to="/store" className="fortis-btn-secondary text-xs">View Store</Link>
      </div>

      <div className="mt-7 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
        {/* Add Category Form */}
        <form onSubmit={createCategory} className="h-fit rounded-3xl border border-white/[.08] bg-[#0c0c12] p-5">
          <h2 className="font-bold text-white text-sm">Add Category</h2>
          <label className="fortis-label mt-3 text-xs">
            Category Name
            <input required minLength={2} value={categoryName} onChange={e => setCategoryName(e.target.value)} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
          </label>
          <button disabled={saving} className="fortis-btn-secondary mt-3 w-full text-xs">Save Category</button>
          <div className="mt-5 space-y-2">
            {categoryOptions.map(c => (
              <div key={c.id} className="flex justify-between rounded-xl bg-white/[.03] px-3 py-2 text-xs">
                <span className="font-semibold text-white">{c.name}</span>
                <span className="text-text-muted">{c.product_count} items</span>
              </div>
            ))}
          </div>
        </form>

        {/* Add / Edit Product Form */}
        <form id="store-product-form" onSubmit={saveProduct} className="scroll-mt-5 rounded-3xl border border-white/[.08] bg-[#0c0c12] p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="font-bold text-white text-base">{editingId ? 'Edit Product' : 'Add New Product'}</h2>
            {editingId && <button type="button" onClick={resetProduct} className="text-xs text-text-muted hover:text-white">Cancel</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="fortis-label text-xs">
              Product Name
              <input required minLength={2} maxLength={160} value={product.name} onChange={e => setProduct({ ...product, name: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs">
              Brand
              <input maxLength={100} value={product.brand} onChange={e => setProduct({ ...product, brand: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs">
              SKU
              <input value={product.sku} onChange={e => setProduct({ ...product, sku: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs">
              Category
              <select required value={product.category_id} onChange={e => setProduct({ ...product, category_id: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs">
                <option value="">Select Category</option>
                {categoryOptions.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <label className="fortis-label text-xs">
              Price (INR)
              <input required type="number" min="0" step="0.01" value={product.price} onChange={e => setProduct({ ...product, price: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs">
              Stock Quantity
              <input required type="number" min="0" step="1" value={product.stock_quantity} onChange={e => setProduct({ ...product, stock_quantity: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs sm:col-span-2">
              Description
              <textarea maxLength={5000} value={product.description} onChange={e => setProduct({ ...product, description: e.target.value })} className="fortis-input mt-1 min-h-24 bg-[#121218] border-white/10 rounded-xl text-xs" />
            </label>
            <label className="fortis-label text-xs sm:col-span-2">
              Product Image
              <input required={!product.image} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { uploadImage(e.target.files?.[0]); e.currentTarget.value = ''; }} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-1.5" />
              <span className="mt-1 block text-[10px] text-text-muted">JPEG, PNG, or WebP (max 8MB). {uploading ? 'Uploading…' : product.image ? 'Image attached.' : 'Choose photo.'}</span>
            </label>
            <label className="fortis-label text-xs sm:col-span-2">
              Tags (comma separated)
              <input value={product.tags} onChange={e => setProduct({ ...product, tags: e.target.value })} className="fortis-input mt-1 bg-[#121218] border-white/10 rounded-xl text-xs" placeholder="strength, gym, activewear" />
            </label>
            <label className="fortis-label text-xs sm:col-span-2">
              Specifications (JSON)
              <textarea value={product.specifications} onChange={e => setProduct({ ...product, specifications: e.target.value })} className="fortis-input mt-1 min-h-20 font-mono text-xs bg-[#121218] border-white/10 rounded-xl" placeholder={'{"Material":"Steel","Color":"Black"}'} />
            </label>
            <label className="fortis-label text-xs sm:col-span-2">
              Variants (JSON)
              <textarea value={product.variants} onChange={e => setProduct({ ...product, variants: e.target.value })} className="fortis-input mt-1 min-h-24 font-mono text-xs bg-[#121218] border-white/10 rounded-xl" placeholder={'[{"name":"Medium / Black","sku":"SKU-M-B","price_paise":19900,"stock_quantity":10,"attributes":{"size":"M","color":"Black"}}]'} />
            </label>
            <div className="flex flex-wrap gap-4 sm:col-span-2 pt-2">
              {([['featured', 'Featured'], ['active', 'Visible in store'], ['demo_only', 'Demo only (cannot purchase)']] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" checked={product[key]} onChange={e => setProduct({ ...product, [key]: e.target.checked })} className="accent-orange-500 rounded" />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          {product.image && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[.03] p-3 border border-white/5">
              <img src={productImageSrc(product.image)} alt="Preview" className="h-16 w-16 rounded-xl object-cover" />
              <span className="text-xs text-text-muted">Attached product image</span>
            </div>
          )}
          <button disabled={saving || uploading || !categoryOptions.length} className="fortis-btn-primary mt-5 w-full py-2.5 text-xs font-bold shadow-glow">
            {saving ? 'Saving…' : editingId ? 'Update Product' : 'Add to Catalog'}
          </button>
        </form>
      </div>

      {/* Catalog Listing for Admin */}
      <div className="mt-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Catalog Products</h2>
            <p className="mt-0.5 text-xs text-text-muted">{productTotal} products in database</p>
          </div>
          <Link to="/admin/products/new" className="fortis-btn-primary inline-flex items-center gap-1.5 text-xs font-bold">
            <Plus size={14} /> Add Product
          </Link>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <input value={productSearch} onChange={e => { setProductSearch(e.target.value); setProductPage(1); }} placeholder="Search name, SKU, brand" className="fortis-input bg-[#121218] border-white/10 rounded-xl text-xs" />
          <select value={productCategory} onChange={e => { setProductCategory(e.target.value); setProductPage(1); }} className="fortis-input bg-[#121218] border-white/10 rounded-xl text-xs">
            <option value="">All Categories</option>
            {categoryOptions.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
          </select>
          <select value={productStatus} onChange={e => { setProductStatus(e.target.value); setProductPage(1); }} className="fortis-input bg-[#121218] border-white/10 rounded-xl text-xs">
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
          <select value={productStock} onChange={e => { setProductStock(e.target.value); setProductPage(1); }} className="fortis-input bg-[#121218] border-white/10 rounded-xl text-xs">
            <option value="all">All Stock Levels</option>
            <option value="out">Out of Stock</option>
            <option value="low">Low Stock</option>
            <option value="in_stock">In Stock</option>
          </select>
        </div>

        <div className="space-y-3">
          {products.map(item => (
            <article key={item.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border border-white/[.08] bg-[#0c0c12] p-3 transition ${item.active === false ? 'opacity-50' : ''}`}>
              <div className="h-14 w-14 flex-none overflow-hidden rounded-xl bg-dark-card border border-white/5">
                {item.image && <img src={productImageSrc(item.image)} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-xs text-white">{item.name}</p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {categoryLabel(categories, item.category_id)} · {inr(item.price_paise)} · Stock: {item.stock_quantity} · {item.active === false ? 'Hidden' : 'Visible'}
                </p>
              </div>
              <button onClick={() => navigate(`/admin/products/${item.id}/edit`)} className="fortis-btn-secondary px-3 py-1.5 text-xs font-semibold">
                Edit
              </button>
              {item.active !== false && (
                <button onClick={() => removeProduct(item)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20 transition">
                  Delete
                </button>
              )}
            </article>
          ))}
          {!products.length && (
            <p className="rounded-2xl border border-white/[.08] bg-[#0c0c12] p-8 text-center text-xs text-text-muted">
              No products found.
            </p>
          )}
        </div>

        {productPages > 1 && (
          <div className="mt-6 flex items-center justify-center gap-4">
            <button disabled={productPage <= 1} onClick={() => setProductPage(n => n - 1)} className="fortis-btn-secondary disabled:opacity-40 text-xs px-3 py-1.5">
              Previous
            </button>
            <span className="text-xs text-text-muted">Page {productPage} of {productPages}</span>
            <button disabled={productPage >= productPages} onClick={() => setProductPage(n => n + 1)} className="fortis-btn-secondary disabled:opacity-40 text-xs px-3 py-1.5">
              Next
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
