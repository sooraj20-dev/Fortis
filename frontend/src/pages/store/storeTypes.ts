export interface StoreCategory { id: string; name: string; slug: string; description?: string; image?: string; product_count: number }
export interface StoreVariant { id: string; name: string; sku?: string; price_paise?: number | null; stock_quantity: number; attributes?: Record<string, string> }
export interface StoreProduct { id: string; name: string; slug: string; brand?: string; category_id: string; description?: string; image?: string; price_paise: number; stock_quantity: number; sku?: string; featured?: boolean; active?: boolean; demo_only?: boolean; tags?: string[]; specifications?: Record<string, string>; variants?: StoreVariant[]; variant_id?: string; variant_name?: string }
export interface CatalogPage { items: StoreProduct[]; page: number; limit: number; total: number; pages: number }
export interface CartItem { item_id: string; product: StoreProduct; quantity: number; variant_id?: string; variant_name?: string; variant_stock_quantity?: number; unit_price_paise: number; line_total_paise: number; available: boolean }
export interface CartSummary { items: CartItem[]; subtotal_paise: number; shipping_paise: number; total_paise: number; currency: string }
export const inr = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(paise / 100);
