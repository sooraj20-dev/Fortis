"""Seed a clearly labeled, non-purchasable store catalog for local development."""
from datetime import datetime, timezone


DEMO_CATEGORIES = [
    {"name": "Gym Equipment", "slug": "gym-equipment", "description": "Strength and home gym equipment.", "sort_order": 1, "image": "/store-assets/gym-equipment/adjustable-dumbbell-set.webp"},
    {"name": "Fitness Apparel", "slug": "fitness-apparel", "description": "Training clothing and wearables.", "sort_order": 2, "image": "/store-assets/fitness-apparel/training-t-shirt.webp"},
    {"name": "Accessories", "slug": "accessories", "description": "Useful training essentials.", "sort_order": 3, "image": "/store-assets/accessories/shaker-bottle.webp"},
    {"name": "Recovery and Mobility", "slug": "recovery-mobility", "description": "Mobility and recovery tools.", "sort_order": 4, "image": "/store-assets/recovery-mobility/training-mat.webp"},
]

DEMO_PRODUCTS = [
    ("adjustable-dumbbell-set-demo", "Adjustable Dumbbell Set", "gym-equipment", "A sample listing for adjustable dumbbells. Demonstration content only."),
    ("resistance-band-kit-demo", "Resistance Band Kit", "gym-equipment", "A sample listing for resistance bands. Demonstration content only."),
    ("folding-training-bench-demo", "Folding Training Bench", "gym-equipment", "A sample listing for a home training bench. Demonstration content only."),
    ("training-mat-demo", "Training and Mobility Mat", "recovery-mobility", "A sample listing for floor training and mobility. Demonstration content only."),
    ("shaker-bottle-demo", "Shaker Bottle", "accessories", "A sample listing for a workout bottle. Demonstration content only."),
    ("training-t-shirt-demo", "Training T-Shirt", "fitness-apparel", "A sample listing for training apparel. Demonstration content only."),
]


def seed_demo_store(db):
    """Insert sample catalog records only into completely empty store collections."""
    if db.store_products.count_documents({}) or db.store_categories.count_documents({}):
        return False
    now = datetime.now(timezone.utc)
    categories = [{**item, "active": True, "image": item.get("image", ""), "created_at": now, "updated_at": now} for item in DEMO_CATEGORIES]
    db.store_categories.insert_many(categories)
    products = [{
        "name": name,
        "slug": slug,
        "brand": "",
        "category_id": category,
        "description": description,
        "image": f"/store-assets/{category}/{slug.removesuffix('-demo')}.webp",
        "price_paise": 0,
        "currency": "INR",
        "stock_quantity": 0,
        "sku": f"DEMO-{slug.upper()}",
        "tags": ["demo", "sample", category],
        "specifications": {},
        "featured": index < 3,
        "active": True,
        "demo_only": True,
        "created_at": now,
        "updated_at": now,
    } for index, (slug, name, category, description) in enumerate(DEMO_PRODUCTS)]
    db.store_products.insert_many(products)
    return True
