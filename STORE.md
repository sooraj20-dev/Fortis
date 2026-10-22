# FORTIS Store

FORTIS Store is integrated into the existing React app shell at `/store`. It uses the existing Axios JWT client, React Router, Tailwind theme, MongoDB connection, FastAPI authentication dependency, and `users.is_admin` authorization. No separate database, payment provider, or frontend state framework was added.

## Data and price rules

The catalog is intentionally empty until an administrator enters real merchandise. There is no automatic sample catalog or demo inventory. Product and category images are references supplied by the administrator; host images in an appropriately licensed and durable storage service before launch. Money is stored as integer INR paise (`price_paise`) and cart/order summaries are recalculated from current MongoDB product documents. Cart and order ownership is derived from the validated JWT user, never from a request-supplied user ID.

MongoDB collections: `store_products`, `store_categories`, `store_carts`, `store_orders`, and `store_inventory_logs`. Startup creates unique product/category slugs, nonempty SKU uniqueness, category/activity/featured and text-search product indexes, unique cart owner, order owner/date, order number and owner/idempotency indexes, and inventory product/date index.

## Store endpoints

- `GET /api/store/categories`
- `GET /api/store/products` (search, category, brand, availability, sort, page, limit)
- `GET /api/store/products/{slug}`
- `GET /api/store/cart`; `POST /api/store/cart/items`; `PATCH` or `DELETE /api/store/cart/items/{item_id}`
- `POST /api/store/checkout/preview`; `POST /api/store/checkout` (`Idempotency-Key` required)
- `GET /api/store/orders`; `GET /api/store/orders/{order_id}` (owner scoped)
- Admin only: category CRUD, product list/detail/create/update/archive, image uploads, dashboard summary/activity, inventory listing/adjustments, read-only order listing/detail, and store settings under `/api/store/admin/*`. Every endpoint verifies `users.is_admin` on the server.

Authenticated carts and orders are persisted in MongoDB. Guest cart data is stored in browser local storage and is merged into the account cart after sign in; inventory conflicts are shown for review. Checkout conditionally decrements stock to prevent overselling and writes inventory logs. Orders snapshot product names, variants, price and delivery address. The current pending-payment flow does not include expiry/cancellation or automatic stock restoration, so pending orders require administrative operations before a production rollout.

## Payment, shipping and production setup

No payment gateway, shipping rate service, tax configuration, product upload service, or provider credential is configured in this repository. Checkout therefore creates an **unpaid** order with `payment_status=pending` and `order_status=pending_payment`; it never claims payment success or accepts card details. The amount currently covers catalog item prices only. Shipping and tax are unconfigured and must be determined before charging or fulfilling orders. Do not treat pending order creation as a completed purchase. Connect a provider using server-side order creation, signed webhook/payment verification, duplicate request handling, and a documented order state transition before accepting payment.

Before commercial launch, configure durable image storage, shipping/returns terms, applicable Indian GST and invoicing, consumer protection/e-commerce disclosures, privacy and refund processes, payment reconciliation, and product-specific legal requirements. Nutrition product claims, ingredients, allergens, and label information must come from verified supplier labels; the store does not generate such information.

To set up an administrator on Windows, run `cd backend` followed by `.\venv\Scripts\python.exe create_admin.py`. The interactive utility securely creates an admin account or promotes an existing account and prompts for its password without echoing it. Sign in at `/admin/login`; the separate admin dashboard starts at `/admin/dashboard`. It provides product CRUD, category and variant management, inventory adjustments with audit logs, catalog metrics, settings, read-only order details, and image uploads (JPEG, PNG, or WebP up to 8 MB). Uploaded images are resized and stored as WebP under the configured upload directory. Removing a product archives it from the store and active carts while retaining its record for order history. The API validates admin rights server-side; do not grant admin access by changing a frontend flag.

For development previews only, set `APP_ENV=development` in the backend environment and restart the backend. An admin can then use **Load sample catalog** from the local `/store/admin` page, or additionally set `STORE_DEMO_SEED_ENABLED=true` to seed automatically at startup. Seeding only runs when both store product and category collections are empty. It inserts six clearly labeled sample items with illustrative images, but no real prices or stock; they are blocked from cart and checkout. Replace them with verified merchandise details before launch. Do not enable the demo seed flag in production.
