"""Catalog, cart and pending-payment ordering for FORTIS Store.

Prices are stored as integer paise. Checkout reserves inventory conditionally and
creates an order with pending_payment status; no payment is claimed or collected.
"""
from datetime import datetime, timezone
from typing import Optional
import re
import uuid
import io
import os

from bson import ObjectId
from pymongo.errors import DuplicateKeyError
from fastapi import APIRouter, Depends, HTTPException, Query, Header, File, UploadFile
from pydantic import BaseModel, Field, model_validator
from PIL import Image, UnidentifiedImageError

from app.database import get_mongo_db
from app.config import settings
from app.deps import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/store", tags=["store"])


def _now():
    return datetime.now(timezone.utc)


def _public(doc):
    if not doc:
        return None
    result = dict(doc)
    result["id"] = str(result.pop("_id", ""))
    return result


def _slug(value):
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", value.lower())).strip("-")


class CartItemInput(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    quantity: int = Field(ge=1, le=25)


class Address(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    phone: str = Field(min_length=8, max_length=20)
    line1: str = Field(min_length=4, max_length=200)
    line2: str = Field(default="", max_length=200)
    city: str = Field(min_length=2, max_length=100)
    state: str = Field(min_length=2, max_length=100)
    postal_code: str = Field(min_length=5, max_length=12)


class CheckoutInput(BaseModel):
    address: Address


class ProductVariantInput(BaseModel):
    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12], min_length=1, max_length=40)
    name: str = Field(min_length=1, max_length=100)
    sku: str = Field(default="", max_length=100)
    price_paise: Optional[int] = Field(default=None, ge=0)
    stock_quantity: int = Field(ge=0)
    attributes: dict[str, str] = Field(default_factory=dict)


class ProductInput(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    brand: str = Field(default="", max_length=100)
    category_id: str
    description: str = Field(default="", max_length=5000)
    image: str = Field(default="", max_length=1000)
    price_paise: int = Field(ge=0)
    stock_quantity: int = Field(ge=0)
    sku: str = Field(default="", max_length=100)
    tags: list[str] = Field(default_factory=list)
    specifications: dict = Field(default_factory=dict)
    featured: bool = False
    active: bool = True
    demo_only: bool = False
    variants: list[ProductVariantInput] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def normalize_variants(self):
        if self.variants:
            ids = [variant.id for variant in self.variants]
            skus = [variant.sku.strip().lower() for variant in self.variants if variant.sku.strip()]
            if len(ids) != len(set(ids)):
                raise ValueError("Variant IDs must be unique within a product")
            if len(skus) != len(set(skus)):
                raise ValueError("Variant SKUs must be unique within a product")
            self.stock_quantity = sum(variant.stock_quantity for variant in self.variants)
            self.price_paise = min(variant.price_paise if variant.price_paise is not None else self.price_paise for variant in self.variants)
        return self


class CategoryInput(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=500)
    image: str = Field(default="", max_length=1000)
    sort_order: int = 0
    active: bool = True


class CategoryUpdateInput(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    image: Optional[str] = Field(default=None, max_length=1000)
    sort_order: Optional[int] = None
    active: Optional[bool] = None


class InventoryAdjustmentInput(BaseModel):
    product_id: str
    variant_id: Optional[str] = None
    adjustment: int = Field(ne=0, ge=-100000, le=100000)
    reason: str = Field(min_length=2, max_length=100)
    note: str = Field(default="", max_length=500)


def _admin(user: User):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Administrator access required")


def _audit(db, user: User, action: str, resource_type: str, resource_id: str, summary: dict):
    db.store_admin_audit.insert_one({
        "actor_id": user.id, "action": action, "resource_type": resource_type,
        "resource_id": resource_id, "summary": summary, "created_at": _now(),
    })


def _find_variant(product, variant_id):
    variants = product.get("variants") or []
    if not variants:
        return None
    return next((variant for variant in variants if variant.get("id") == variant_id), None)


def _line_price_stock(product, variant_id=None):
    variant = _find_variant(product, variant_id)
    if product.get("variants"):
        if not variant:
            return int(product.get("price_paise", 0)), 0, None
        price = variant.get("price_paise")
        return int(price if price is not None else product.get("price_paise", 0)), int(variant.get("stock_quantity", 0)), variant
    return int(product.get("price_paise", 0)), int(product.get("stock_quantity", 0)), None


@router.get("/categories")
def categories(db=Depends(get_mongo_db)):
    rows = list(db.store_categories.find({"active": True}).sort("sort_order", 1))
    for row in rows:
        row["product_count"] = db.store_products.count_documents({"category_id": row.get("slug"), "active": True})
    return [_public(row) for row in rows]


@router.get("/products")
def products(search: str = "", category: str = "", brand: str = "", featured: Optional[bool] = None, available: bool = False,
             sort: str = "recommended", page: int = Query(1, ge=1), limit: int = Query(12, ge=1, le=48), db=Depends(get_mongo_db)):
    query = {"active": True}
    if category:
        query["category_id"] = category
    if brand:
        query["brand"] = {"$regex": f"^{re.escape(brand)}$", "$options": "i"}
    if featured is not None:
        query["featured"] = featured
    if available:
        query["stock_quantity"] = {"$gt": 0}
    if search.strip():
        terms = re.escape(search.strip())
        query["$or"] = [{key: {"$regex": terms, "$options": "i"}} for key in (
            "name", "description", "brand", "category_id", "sku", "tags",
            "specifications.Material", "specifications.Size", "specifications.Color",
            "specifications.Type", "variants.name", "variants.attributes.size",
            "variants.attributes.color",
        )]
        query["$or"].append({"$expr": {"$regexMatch": {
            "input": {"$reduce": {
                "input": {"$objectToArray": {"$ifNull": ["$specifications", {}]}},
                "initialValue": "",
                "in": {"$concat": ["$$value", " ", {"$convert": {"input": "$$this.v", "to": "string", "onError": "", "onNull": ""}}]},
            }},
            "regex": terms,
            "options": "i",
        }}})
    sorting = {"price_asc": [("price_paise", 1)], "price_desc": [("price_paise", -1)],
               "newest": [("created_at", -1)], "name": [("name", 1)],
               "recommended": [("featured", -1), ("created_at", -1)]}.get(sort, [("featured", -1), ("created_at", -1)])
    total = db.store_products.count_documents(query)
    items = list(db.store_products.find(query).sort(sorting).skip((page - 1) * limit).limit(limit))
    return {"items": [_public(x) for x in items], "page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}


@router.get("/products/{slug}")
def product(slug: str, db=Depends(get_mongo_db)):
    row = db.store_products.find_one({"slug": slug, "active": True})
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return _public(row)


def _user_cart(db, user_id):
    cart = db.store_carts.find_one({"user_id": user_id})
    return cart or {"items": []}


def _cart_summary(db, cart):
    items, subtotal = [], 0
    for entry in cart.get("items", []):
        try:
            product = db.store_products.find_one({"_id": ObjectId(entry["product_id"]), "active": True})
        except Exception:
            product = None
        if not product:
            continue
        qty = int(entry["quantity"])
        variant_id = entry.get("variant_id")
        price, stock, variant = _line_price_stock(product, variant_id)
        items.append({"item_id": entry["item_id"], "product": _public(product), "quantity": qty,
                      "variant_id": variant_id, "variant_name": variant.get("name") if variant else None, "variant_stock_quantity": stock, "unit_price_paise": price,
                      "line_total_paise": price * qty, "available": stock >= qty and not product.get("demo_only", False)})
        subtotal += price * qty
    return {"items": items, "subtotal_paise": subtotal, "shipping_paise": 0,
            "total_paise": subtotal, "currency": "INR"}


@router.get("/cart")
def get_cart(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    return _cart_summary(db, _user_cart(db, user.id))


@router.post("/cart/items")
def add_cart_item(payload: CartItemInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    try:
        product = db.store_products.find_one({"_id": ObjectId(payload.product_id), "active": True})
    except Exception:
        product = None
    if not product:
        raise HTTPException(404, "Product not found")
    if product.get("demo_only"):
        raise HTTPException(409, "This is a demonstration listing and cannot be purchased")
    if product.get("variants") and not payload.variant_id:
        raise HTTPException(422, "Choose a product variant before adding it to your bag")
    price, stock, variant = _line_price_stock(product, payload.variant_id)
    if product.get("variants") and not variant:
        raise HTTPException(404, "Product variant not found")
    if stock < payload.quantity:
        raise HTTPException(409, "Requested quantity is unavailable")
    cart = _user_cart(db, user.id)
    items = list(cart.get("items", []))
    match = next((x for x in items if x["product_id"] == payload.product_id and x.get("variant_id") == payload.variant_id), None)
    if match:
        if match["quantity"] + payload.quantity > stock:
            raise HTTPException(409, "Requested quantity is unavailable")
        match["quantity"] += payload.quantity
    else:
        items.append({"item_id": uuid.uuid4().hex, "product_id": payload.product_id,
                      "variant_id": payload.variant_id, "quantity": payload.quantity})
    db.store_carts.update_one({"user_id": user.id}, {"$set": {"items": items, "updated_at": _now()}, "$setOnInsert": {"created_at": _now()}}, upsert=True)
    return _cart_summary(db, {"items": items})


@router.patch("/cart/items/{item_id}")
def update_cart_item(item_id: str, quantity: int = Query(..., ge=1, le=25), user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    cart = _user_cart(db, user.id)
    entries = list(cart.get("items", []))
    entry = next((x for x in entries if x["item_id"] == item_id), None)
    if not entry:
        raise HTTPException(404, "Cart item not found")
    product = db.store_products.find_one({"_id": ObjectId(entry["product_id"]), "active": True})
    _, stock, variant = _line_price_stock(product, entry.get("variant_id")) if product else (0, 0, None)
    if not product or (product.get("variants") and not variant) or quantity > stock:
        raise HTTPException(409, "Requested quantity is unavailable")
    entry["quantity"] = quantity
    db.store_carts.update_one({"user_id": user.id}, {"$set": {"items": entries, "updated_at": _now()}})
    return _cart_summary(db, {"items": entries})


@router.delete("/cart/items/{item_id}")
def remove_cart_item(item_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    cart = _user_cart(db, user.id)
    entries = [x for x in cart.get("items", []) if x["item_id"] != item_id]
    db.store_carts.update_one({"user_id": user.id}, {"$set": {"items": entries, "updated_at": _now()}})
    return _cart_summary(db, {"items": entries})


@router.post("/checkout/preview")
def checkout_preview(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    summary = _cart_summary(db, _user_cart(db, user.id))
    if not summary["items"]:
        raise HTTPException(400, "Your cart is empty")
    if any(not item["available"] for item in summary["items"]):
        raise HTTPException(409, "One or more items are no longer available in the requested quantity")
    return {**summary, "payment_mode": "unconfigured", "message": "Payment gateway is not configured. Placing this order will create an unpaid order."}


@router.post("/checkout", status_code=201)
def checkout(payload: CheckoutInput, idempotency_key: str = Header(..., alias="Idempotency-Key"), user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    prior = db.store_orders.find_one({"user_id": user.id, "idempotency_key": idempotency_key})
    if prior:
        return _public(prior)
    cart = _user_cart(db, user.id)
    summary = _cart_summary(db, cart)
    if not summary["items"]:
        raise HTTPException(400, "Your cart is empty")
    if any(item["product"].get("demo_only") for item in summary["items"]):
        raise HTTPException(409, "Remove demonstration listings before checkout")
    if any(not item["available"] for item in summary["items"]):
        raise HTTPException(409, "One or more items are no longer available in the requested quantity")
    snapshots, decremented = [], []
    inserted_order_id = None
    try:
        for item in summary["items"]:
            product_id = ObjectId(item["product"]["id"])
            variant_id = item.get("variant_id")
            query = {"_id": product_id, "active": True, "stock_quantity": {"$gte": item["quantity"]}}
            increments = {"stock_quantity": -item["quantity"]}
            options = {}
            if variant_id:
                query["variants"] = {"$elemMatch": {"id": variant_id, "stock_quantity": {"$gte": item["quantity"]}}}
                increments["variants.$[variant].stock_quantity"] = -item["quantity"]
                options["array_filters"] = [{"variant.id": variant_id}]
            changed = db.store_products.update_one(query, {"$inc": increments}, **options)
            if changed.modified_count != 1:
                raise HTTPException(409, f"{item['product']['name']} is no longer available in the requested quantity")
            decremented.append((product_id, item["quantity"], item["product"]["id"], variant_id))
            snapshots.append({"product_id": item["product"]["id"], "name": item["product"]["name"],
                              "image": item["product"].get("image", ""), "variant_id": item["variant_id"], "variant_name": item.get("variant_name"),
                              "quantity": item["quantity"], "unit_price_paise": item["unit_price_paise"],
                              "line_total_paise": item["line_total_paise"]})
        now = _now()
        order = {"order_number": "FT-" + uuid.uuid4().hex[:10].upper(), "user_id": user.id,
                 "items": snapshots, "shipping_address_snapshot": payload.address.model_dump(),
                 "subtotal_paise": summary["subtotal_paise"], "shipping_paise": 0,
                 "grand_total_paise": summary["total_paise"], "currency": "INR",
                 "payment_status": "pending", "order_status": "pending_payment",
                 "idempotency_key": idempotency_key, "created_at": now, "updated_at": now}
        result = db.store_orders.insert_one(order)
        order["_id"] = result.inserted_id
        inserted_order_id = result.inserted_id
        for product_id, qty, pid, variant_id in decremented:
            db.store_inventory_logs.insert_one({"product_id": pid, "variant_id": variant_id, "quantity_change": -qty, "reason": "order_pending_payment", "order_id": str(result.inserted_id), "created_at": now, "actor_id": user.id})
        db.store_carts.update_one({"user_id": user.id}, {"$set": {"items": [], "updated_at": now}})
        return _public(order)
    except Exception as exc:
        if inserted_order_id:
            db.store_inventory_logs.delete_many({"order_id": str(inserted_order_id)})
            db.store_orders.delete_one({"_id": inserted_order_id})
        for product_id, qty, _, variant_id in decremented:
            increments = {"stock_quantity": qty}
            options = {}
            if variant_id:
                increments["variants.$[variant].stock_quantity"] = qty
                options["array_filters"] = [{"variant.id": variant_id}]
            db.store_products.update_one({"_id": product_id}, {"$inc": increments}, **options)
        if isinstance(exc, DuplicateKeyError):
            prior = db.store_orders.find_one({"user_id": user.id, "idempotency_key": idempotency_key})
            if prior:
                return _public(prior)
        raise


@router.get("/orders")
def orders(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    return [_public(x) for x in db.store_orders.find({"user_id": user.id}).sort("created_at", -1).limit(100)]


@router.get("/orders/{order_id}")
def order_detail(order_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    try:
        order = db.store_orders.find_one({"_id": ObjectId(order_id), "user_id": user.id})
    except Exception:
        order = None
    if not order:
        raise HTTPException(404, "Order not found")
    return _public(order)


@router.post("/admin/categories")
def admin_category(payload: CategoryInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    doc = {**payload.model_dump(), "slug": _slug(payload.name), "updated_at": _now(), "created_at": _now()}
    try:
        result = db.store_categories.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "A category with that name already exists")
    _audit(db, user, "category_created", "category", str(result.inserted_id), {"name": doc["name"]})
    return _public(db.store_categories.find_one({"_id": result.inserted_id}))


@router.get("/admin/dashboard/summary")
def admin_dashboard_summary(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    settings_doc = db.store_settings.find_one({"key": "catalog"}) or {}
    threshold = max(1, int(settings_doc.get("low_stock_threshold", 5)))
    active = {"active": True}
    orders = db.store_orders
    total_orders = orders.count_documents({})
    pending_orders = orders.count_documents({"$or": [
        {"payment_status": "pending"}, {"order_status": "pending_payment"},
    ]}) if total_orders else 0
    attention_items = list(db.store_products.find(
        {**active, "stock_quantity": {"$lte": threshold}}
    ).sort("stock_quantity", 1).limit(8))
    return {
        "active_products": db.store_products.count_documents(active),
        "categories": db.store_categories.count_documents({"active": True}),
        "out_of_stock": db.store_products.count_documents({**active, "stock_quantity": {"$lte": 0}}),
        "low_stock": db.store_products.count_documents({**active, "stock_quantity": {"$gt": 0, "$lte": threshold}}),
        "low_stock_threshold": threshold,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "orders_available": total_orders > 0,
        "revenue_available": False,
        "attention_items": [_public(item) for item in attention_items],
    }


@router.get("/admin/dashboard/recent-activity")
def admin_recent_activity(limit: int = Query(8, ge=1, le=30), user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    events = list(db.store_admin_audit.find({}).sort("created_at", -1).limit(limit))
    for event in events:
        event["id"] = str(event.pop("_id", ""))
        event["kind"] = "admin"
    remaining = max(0, limit - len(events))
    if remaining:
        logs = list(db.store_inventory_logs.find({}).sort("created_at", -1).limit(remaining))
        for event in logs:
            event["id"] = str(event.pop("_id", ""))
            event["kind"] = "inventory"
        events.extend(logs)
    events.sort(key=lambda event: event.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return events[:limit]


@router.get("/admin/categories")
def admin_categories(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    rows = list(db.store_categories.find({}).sort("sort_order", 1))
    for row in rows:
        row["product_count"] = db.store_products.count_documents({"category_id": row.get("slug"), "active": True})
    return [_public(row) for row in rows]


@router.patch("/admin/categories/{category_id}")
def admin_update_category(category_id: str, payload: CategoryUpdateInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        oid = ObjectId(category_id)
    except Exception:
        raise HTTPException(404, "Category not found")
    old = db.store_categories.find_one({"_id": oid})
    if not old:
        raise HTTPException(404, "Category not found")
    changes = payload.model_dump(exclude_none=True)
    if not changes:
        return _public(old)
    changes["updated_at"] = _now()
    db.store_categories.update_one({"_id": oid}, {"$set": changes})
    _audit(db, user, "category_updated", "category", category_id, {"fields": sorted(k for k in changes if k != "updated_at")})
    return _public(db.store_categories.find_one({"_id": oid}))


@router.delete("/admin/categories/{category_id}")
def admin_remove_category(category_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        oid = ObjectId(category_id)
    except Exception:
        raise HTTPException(404, "Category not found")
    category = db.store_categories.find_one({"_id": oid})
    if not category:
        raise HTTPException(404, "Category not found")
    if db.store_products.count_documents({"category_id": category["slug"], "active": True}):
        raise HTTPException(409, "Move or archive active products in this category before deactivating it")
    db.store_categories.update_one({"_id": oid}, {"$set": {"active": False, "updated_at": _now()}})
    _audit(db, user, "category_deactivated", "category", category_id, {"name": category.get("name", "")})
    return {"deactivated": True, "category_id": category_id}


@router.get("/admin/inventory")
def admin_inventory(search: str = "", category: str = "", status: str = "all", page: int = Query(1, ge=1),
                    limit: int = Query(20, ge=1, le=100), user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    threshold = max(1, int((db.store_settings.find_one({"key": "catalog"}) or {}).get("low_stock_threshold", 5)))
    query = {"active": True}
    if category:
        query["category_id"] = category
    if search.strip():
        pattern = re.escape(search.strip())
        query["$or"] = [{k: {"$regex": pattern, "$options": "i"}} for k in ("name", "brand", "sku", "variants.sku")]
    stock_match = {}
    if status == "out": stock_match = {"stock_quantity": {"$lte": 0}}
    elif status == "low": stock_match = {"stock_quantity": {"$gt": 0, "$lte": threshold}}
    elif status == "in_stock": stock_match = {"stock_quantity": {"$gt": threshold}}
    pipeline = [
        {"$match": query},
        {"$unwind": {"path": "$variants", "preserveNullAndEmptyArrays": True}},
        {"$addFields": {"stock_quantity": {"$ifNull": ["$variants.stock_quantity", "$stock_quantity"]},
                         "sku": {"$ifNull": ["$variants.sku", "$sku"]},
                         "variant_name": "$variants.name", "variant_id": "$variants.id"}},
    ]
    if stock_match:
        pipeline.append({"$match": stock_match})
    pipeline.append({"$facet": {
        "items": [{"$sort": {"stock_quantity": 1, "name": 1}}, {"$skip": (page - 1) * limit}, {"$limit": limit}],
        "total": [{"$count": "count"}],
    }})
    result = list(db.store_products.aggregate(pipeline))[0]
    rows = [_public(row) for row in result.get("items", [])]
    total = result.get("total", [{}])[0].get("count", 0)
    return {"items": rows, "page": page, "limit": limit, "total": total,
            "pages": (total + limit - 1) // limit, "low_stock_threshold": threshold}


@router.post("/admin/inventory/adjustments")
def admin_inventory_adjustment(payload: InventoryAdjustmentInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        oid = ObjectId(payload.product_id)
    except Exception:
        raise HTTPException(404, "Product not found")
    product = db.store_products.find_one({"_id": oid})
    if not product:
        raise HTTPException(404, "Product not found")
    variant = _find_variant(product, payload.variant_id) if payload.variant_id else None
    if product.get("variants") and not payload.variant_id:
        raise HTTPException(422, "Select a variant to adjust its inventory")
    if payload.variant_id and not variant:
        raise HTTPException(404, "Product variant not found")
    before = int(variant.get("stock_quantity", 0)) if variant else int(product.get("stock_quantity", 0))
    after = before + payload.adjustment
    if after < 0:
        raise HTTPException(409, "Stock cannot be adjusted below zero")
    query = {"_id": oid}
    increments = {"stock_quantity": payload.adjustment}
    options = {}
    if variant:
        query["variants"] = {"$elemMatch": {"id": payload.variant_id, "stock_quantity": before}}
        increments["variants.$[variant].stock_quantity"] = payload.adjustment
        options["array_filters"] = [{"variant.id": payload.variant_id}]
    else:
        query["stock_quantity"] = before
    updated = db.store_products.update_one(query, {"$inc": increments, "$set": {"updated_at": _now()}}, **options)
    if updated.modified_count != 1:
        raise HTTPException(409, "Inventory changed while you were editing it. Refresh and try again")
    try:
        log = {"product_id": payload.product_id, "variant_id": payload.variant_id, "quantity_change": payload.adjustment, "reason": payload.reason,
               "note": payload.note, "created_at": _now(), "actor_id": user.id}
        inserted_log = db.store_inventory_logs.insert_one(log)
        _audit(db, user, "inventory_adjusted", "product", payload.product_id,
               {"variant_id": payload.variant_id, "quantity_change": payload.adjustment, "reason": payload.reason})
    except Exception:
        increments = {"stock_quantity": -payload.adjustment}
        options = {}
        query = {"_id": oid}
        if variant:
            increments["variants.$[variant].stock_quantity"] = -payload.adjustment
            options["array_filters"] = [{"variant.id": payload.variant_id}]
        else:
            query["stock_quantity"] = int(product.get("stock_quantity", 0)) + payload.adjustment
        db.store_products.update_one(query, {"$inc": increments}, **options)
        if "inserted_log" in locals(): db.store_inventory_logs.delete_one({"_id": inserted_log.inserted_id})
        raise
    return {"product_id": payload.product_id, "variant_id": payload.variant_id, "stock_quantity": after}


@router.get("/admin/orders")
def admin_orders(search: str = "", status: str = "", page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                 user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    query = {}
    if status:
        query["order_status"] = status
    if search.strip():
        query["order_number"] = {"$regex": re.escape(search.strip()), "$options": "i"}
    total = db.store_orders.count_documents(query)
    rows = list(db.store_orders.find(query).sort("created_at", -1).skip((page - 1) * limit).limit(limit))
    return {"items": [_public(row) for row in rows], "page": page, "limit": limit, "total": total,
            "pages": (total + limit - 1) // limit}


@router.get("/admin/orders/{order_id}")
def admin_order_detail(order_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        row = db.store_orders.find_one({"_id": ObjectId(order_id)})
    except Exception:
        row = None
    if not row:
        raise HTTPException(404, "Order not found")
    return _public(row)


@router.get("/admin/settings")
def admin_settings(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    doc = db.store_settings.find_one({"key": "catalog"}) or {"low_stock_threshold": 5, "currency": "INR", "store_name": "FORTIS Store"}
    return {k: v for k, v in doc.items() if k != "_id" and k != "key"}


@router.put("/admin/settings")
def admin_update_settings(low_stock_threshold: int = Query(5, ge=1, le=500), user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    doc = {"key": "catalog", "low_stock_threshold": low_stock_threshold, "currency": "INR", "store_name": "FORTIS Store",
           "updated_at": _now(), "updated_by": user.id}
    db.store_settings.update_one({"key": "catalog"}, {"$set": doc}, upsert=True)
    _audit(db, user, "store_settings_updated", "settings", "catalog", {"low_stock_threshold": low_stock_threshold})
    return {k: v for k, v in doc.items() if k not in {"key", "updated_by"}}


@router.get("/admin/products")
def admin_products(search: str = "", category: str = "", status: str = "all", stock: str = "all",
                   page: int = Query(1, ge=1), limit: int = Query(20, ge=1, le=100),
                   user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    query = {}
    if status == "active": query["active"] = True
    elif status == "archived": query["active"] = False
    if category: query["category_id"] = category
    if search.strip():
        pattern = re.escape(search.strip())
        query["$or"] = [{k: {"$regex": pattern, "$options": "i"}} for k in ("name", "brand", "sku")]
    if stock == "out": query["stock_quantity"] = {"$lte": 0}
    elif stock == "in_stock": query["stock_quantity"] = {"$gt": 0}
    elif stock == "low":
        threshold = max(1, int((db.store_settings.find_one({"key": "catalog"}) or {}).get("low_stock_threshold", 5)))
        query["stock_quantity"] = {"$gt": 0, "$lte": threshold}
    total = db.store_products.count_documents(query)
    rows = list(db.store_products.find(query).sort("updated_at", -1).skip((page - 1) * limit).limit(limit))
    return {"items": [_public(row) for row in rows], "page": page, "limit": limit, "total": total,
            "pages": (total + limit - 1) // limit}


@router.get("/admin/products/{product_id}")
def admin_get_product(product_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        row = db.store_products.find_one({"_id": ObjectId(product_id)})
    except Exception:
        row = None
    if not row:
        raise HTTPException(404, "Product not found")
    return _public(row)


@router.post("/admin/product-images", status_code=201)
async def admin_product_image(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    _admin(user)
    contents = await file.read(8 * 1024 * 1024 + 1)
    if len(contents) > 8 * 1024 * 1024:
        raise HTTPException(413, "Product images must be 8 MB or smaller")
    try:
        with Image.open(io.BytesIO(contents)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise HTTPException(415, "Use a JPEG, PNG, or WebP product image")
            if image.width * image.height > 40_000_000:
                raise HTTPException(413, "Product image dimensions are too large")
            image.verify()
        with Image.open(io.BytesIO(contents)) as image:
            image = image.convert("RGB")
            image.thumbnail((1800, 1800))
            name = f"{uuid.uuid4().hex}.webp"
            folder = os.path.join(settings.UPLOAD_DIR, "store-products")
            os.makedirs(folder, exist_ok=True)
            image.save(os.path.join(folder, name), "WEBP", quality=88, method=6)
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError):
        raise HTTPException(400, "The uploaded file is not a valid image")
    return {"image": f"/uploads/store-products/{name}"}


@router.post("/admin/demo-catalog")
def admin_seed_demo_catalog(user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    """Load non-purchasable sample merchandise only in explicitly enabled development."""
    _admin(user)
    if settings.APP_ENV.lower() != "development":
        raise HTTPException(403, "The demonstration catalog can only be loaded in development")
    from app.seed_data.store_demo import seed_demo_store
    if not seed_demo_store(db):
        raise HTTPException(409, "The catalog is not empty; demo data was not inserted")
    return {"seeded": True, "products": 6, "message": "Sample listings are visible but cannot be purchased."}


@router.post("/admin/products")
def admin_product(payload: ProductInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    if not db.store_categories.find_one({"slug": payload.category_id, "active": True}):
        raise HTTPException(400, "Select an active category")
    doc = {**payload.model_dump(), "slug": _slug(payload.name), "currency": "INR", "updated_at": _now(), "created_at": _now()}
    try:
        result = db.store_products.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "A product with that SKU or URL slug already exists")
    db.store_inventory_logs.insert_one({"product_id": str(result.inserted_id), "quantity_change": payload.stock_quantity, "reason": "product_created", "created_at": _now(), "actor_id": user.id})
    _audit(db, user, "product_created", "product", str(result.inserted_id), {"name": payload.name, "sku": payload.sku})
    return _public(db.store_products.find_one({"_id": result.inserted_id}))


@router.put("/admin/products/{product_id}")
def admin_update_product(product_id: str, payload: ProductInput, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(404, "Product not found")
    old = db.store_products.find_one({"_id": oid})
    if not old:
        raise HTTPException(404, "Product not found")
    if not db.store_categories.find_one({"slug": payload.category_id, "active": True}):
        raise HTTPException(400, "Select an active category")
    if int(old.get("stock_quantity", 0)) != payload.stock_quantity:
        db.store_inventory_logs.insert_one({"product_id": product_id, "quantity_change": payload.stock_quantity - int(old.get("stock_quantity", 0)), "reason": "admin_stock_update", "created_at": _now(), "actor_id": user.id})
    doc = {**payload.model_dump(), "slug": _slug(payload.name), "currency": "INR", "updated_at": _now()}
    try:
        db.store_products.update_one({"_id": oid}, {"$set": doc})
    except DuplicateKeyError:
        raise HTTPException(409, "A product with that SKU or URL slug already exists")
    _audit(db, user, "product_updated", "product", product_id, {"name": payload.name, "sku": payload.sku})
    return _public(db.store_products.find_one({"_id": oid}))


@router.delete("/admin/products/{product_id}")
def admin_remove_product(product_id: str, user: User = Depends(get_current_user), db=Depends(get_mongo_db)):
    _admin(user)
    try:
        oid = ObjectId(product_id)
    except Exception:
        raise HTTPException(404, "Product not found")
    result = db.store_products.update_one({"_id": oid, "active": True}, {"$set": {"active": False, "updated_at": _now()}})
    if not result.modified_count:
        raise HTTPException(404, "Product not found")
    db.store_carts.update_many({}, {"$pull": {"items": {"product_id": product_id}}})
    _audit(db, user, "product_archived", "product", product_id, {"name": db.store_products.find_one({"_id": oid}).get("name", "")})
    return {"removed": True, "product_id": product_id}
