import api from '../../services/api';
import type { CatalogPage, CartSummary, StoreCategory, StoreProduct } from './storeTypes';

export const storeApi = {
  categories: () => api.get<StoreCategory[]>('/api/store/categories').then(r => r.data),
  products: (params: Record<string, string | number | boolean>) => api.get<CatalogPage>('/api/store/products', { params }).then(r => r.data),
  product: (slug: string) => api.get<StoreProduct>(`/api/store/products/${encodeURIComponent(slug)}`).then(r => r.data),
  cart: () => api.get<CartSummary>('/api/store/cart').then(r => r.data),
  add: (product_id: string, quantity: number, variant_id?: string) => api.post<CartSummary>('/api/store/cart/items', { product_id, quantity, variant_id }).then(r => r.data),
  change: (itemId: string, quantity: number) => api.patch<CartSummary>(`/api/store/cart/items/${itemId}`, null, { params: { quantity } }).then(r => r.data),
  remove: (itemId: string) => api.delete<CartSummary>(`/api/store/cart/items/${itemId}`).then(r => r.data),
  preview: () => api.post<CartSummary & { message: string }>('/api/store/checkout/preview').then(r => r.data),
  checkout: (address: object, key: string) => api.post<any>('/api/store/checkout', { address }, { headers: { 'Idempotency-Key': key } }).then(r => r.data),
  orders: () => api.get<any[]>('/api/store/orders').then(r => r.data),
  order: (id: string) => api.get<any>(`/api/store/orders/${id}`).then(r => r.data),
  createCategory: (data: object) => api.post('/api/store/admin/categories', data),
  createProduct: (data: object) => api.post('/api/store/admin/products', data),
  adminProducts: (params: Record<string, string | number> = {}) => api.get<CatalogPage>('/api/store/admin/products', { params }).then(r => r.data),
  adminProduct: (id: string) => api.get<StoreProduct>(`/api/store/admin/products/${id}`).then(r => r.data),
  adminDashboard: () => api.get<any>('/api/store/admin/dashboard/summary').then(r => r.data),
  adminActivity: () => api.get<any[]>('/api/store/admin/dashboard/recent-activity').then(r => r.data),
  adminCategories: () => api.get<StoreCategory[]>('/api/store/admin/categories').then(r => r.data),
  updateCategory: (id: string, data: object) => api.patch(`/api/store/admin/categories/${id}`, data),
  deleteCategory: (id: string) => api.delete(`/api/store/admin/categories/${id}`),
  inventory: (params: Record<string, string | number>) => api.get<CatalogPage & { low_stock_threshold: number }>('/api/store/admin/inventory', { params }).then(r => r.data),
  adjustInventory: (data: object) => api.post('/api/store/admin/inventory/adjustments', data).then(r => r.data),
  adminOrders: (params: Record<string, string | number>) => api.get<CatalogPage>('/api/store/admin/orders', { params }).then(r => r.data),
  adminOrder: (id: string) => api.get<any>(`/api/store/admin/orders/${id}`).then(r => r.data),
  adminSettings: () => api.get<{ low_stock_threshold: number; currency: string; store_name: string }>('/api/store/admin/settings').then(r => r.data),
  updateAdminSettings: (low_stock_threshold: number) => api.put('/api/store/admin/settings', null, { params: { low_stock_threshold } }).then(r => r.data),
  updateProduct: (id: string, data: object) => api.put<StoreProduct>(`/api/store/admin/products/${id}`, data).then(r => r.data),
  deleteProduct: (id: string) => api.delete(`/api/store/admin/products/${id}`),
  uploadProductImage: (file: File) => {
    const form = new FormData(); form.append('file', file);
    return api.post<{ image: string }>('/api/store/admin/product-images', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then(r => r.data);
  },
  seedDemoCatalog: () => api.post('/api/store/admin/demo-catalog'),
};
