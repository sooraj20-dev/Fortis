"""Focused unit checks for store normalization and server-side cart totals."""
from bson import ObjectId
import pytest
from pydantic import ValidationError

from app.routers.store import CartItemInput, _cart_summary, _slug


class ProductCollection:
    def __init__(self, product):
        self.product = product

    def find_one(self, query):
        if self.product and query.get("_id") == self.product["_id"] and query.get("active") is True:
            return self.product
        return None


class FakeDB:
    def __init__(self, product):
        self.store_products = ProductCollection(product)


def test_slug_is_stable_and_url_friendly():
    assert _slug("FORTIS Resistance Bands — Set 5") == "fortis-resistance-bands-set-5"


def test_cart_summary_uses_server_price_in_integer_paise():
    product_id = ObjectId()
    product = {"_id": product_id, "name": "Band set", "slug": "band-set", "active": True,
               "price_paise": 129900, "stock_quantity": 3}
    summary = _cart_summary(FakeDB(product), {"items": [{"item_id": "item-1", "product_id": str(product_id), "quantity": 2}]})
    assert summary["subtotal_paise"] == 259800
    assert summary["total_paise"] == 259800
    assert summary["items"][0]["unit_price_paise"] == 129900
    assert summary["items"][0]["available"] is True


def test_cart_summary_skips_inactive_or_removed_products():
    summary = _cart_summary(FakeDB(None), {"items": [{"item_id": "item-1", "product_id": str(ObjectId()), "quantity": 1}]})
    assert summary["items"] == []
    assert summary["subtotal_paise"] == 0


def test_cart_item_quantity_is_bounded():
    with pytest.raises(ValidationError):
        CartItemInput(product_id=str(ObjectId()), quantity=0)
    with pytest.raises(ValidationError):
        CartItemInput(product_id=str(ObjectId()), quantity=26)
