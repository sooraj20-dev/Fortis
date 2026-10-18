"""
MongoDB Database Engine for Fortis AI
Seamlessly integrates MongoDB Atlas with the Fortis data model.
Provides complete query and session support for SQLAlchemy models over MongoDB.
"""
import os
import re
import logging
from datetime import datetime, date
from typing import Any, Dict, List, Optional, Type
import certifi
import pymongo
from pymongo import ReturnDocument
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base

from app.config import settings

logger = logging.getLogger(__name__)

# SQLAlchemy declarative base for data models
Base = declarative_base()

# Dummy in-memory engine to satisfy Base.metadata.create_all if called
engine = create_engine("sqlite:///:memory:")

# Initialize MongoDB client singleton
_mongo_client: Optional[pymongo.MongoClient] = None
_mongo_db = None


def get_mongo_client() -> pymongo.MongoClient:
    global _mongo_client
    if _mongo_client is None:
        try:
            _mongo_client = pymongo.MongoClient(
                settings.MONGODB_URL,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=15000,
                connect=False
            )
        except Exception as e:
            logger.error(f"Failed to initialize MongoClient: {e}")
            raise
    return _mongo_client


def get_mongo_db():
    global _mongo_db
    if _mongo_db is None:
        client = get_mongo_client()
        _mongo_db = client[settings.MONGODB_DB_NAME]
    return _mongo_db


def _get_collection_name(model: Any) -> str:
    """Get the MongoDB collection name for a model."""
    if hasattr(model, "__tablename__"):
        return model.__tablename__
    return getattr(model, "__name__", str(model)).lower() + "s"


def _get_next_id(db, collection_name: str) -> int:
    """Atomic auto-incrementing integer sequence for MongoDB documents."""
    try:
        res = db["_counters"].find_one_and_update(
            {"_id": collection_name},
            {"$inc": {"seq": 1}},
            upsert=True,
            return_document=ReturnDocument.AFTER
        )
        if res and res.get("seq") == 1:
            highest = db[collection_name].find_one(sort=[("id", -1)])
            max_existing_id = (highest["id"]) if highest and "id" in highest else 0
            if max_existing_id >= 1:
                target_seq = max_existing_id + 1
                db["_counters"].update_one(
                    {"_id": collection_name},
                    {"$set": {"seq": target_seq}}
                )
                return target_seq
        return res["seq"] if res and "seq" in res else 1
    except Exception as e:
        logger.warning(f"Error fetching next sequence from Atlas: {e}. Falling back safely.")
        try:
            highest = db[collection_name].find_one(sort=[("id", -1)])
            return (highest["id"] + 1) if highest and "id" in highest else 1
        except Exception:
            import time
            return int(time.time() * 1000) % 100000000


def _clean_val(val: Any) -> Any:
    """Helper to convert date objects and SQLAlchemy boolean expressions so PyMongo BSON encoding won't error."""
    if hasattr(val, "value"):
        val = val.value
    type_name = type(val).__name__
    if type_name == "True_":
        return True
    if type_name == "False_":
        return False
    if isinstance(val, date) and not isinstance(val, datetime):
        return datetime.combine(val, datetime.min.time())
    if isinstance(val, (list, tuple, set)):
        return [_clean_val(v) for v in val]
    return val


def _model_to_dict(instance: Any) -> Dict[str, Any]:
    """Serialize a model instance to a MongoDB document dictionary."""
    data = {}
    if hasattr(instance, "__table__"):
        for col in instance.__table__.columns:
            val = getattr(instance, col.name, None)
            if isinstance(val, date) and not isinstance(val, datetime):
                val = datetime.combine(val, datetime.min.time())
            data[col.name] = val
    else:
        for k, v in instance.__dict__.items():
            if not k.startswith("_"):
                if isinstance(v, date) and not isinstance(v, datetime):
                    v = datetime.combine(v, datetime.min.time())
                data[k] = v
    data.pop("_id", None)
    return data


def _dict_to_model(doc: Dict[str, Any], model: Type, db: Any = None) -> Any:
    """Instantiate a model instance from a MongoDB document, populating relationships if db provided."""
    if doc is None:
        return None
    data = {k: v for k, v in doc.items() if k != "_id"}
    instance = model()
    for k, v in data.items():
        if hasattr(model, k) or hasattr(instance, k):
            setattr(instance, k, v)

    # Automatically resolve BodyScan relationships if db session is provided
    if db is not None and getattr(instance, "id", None) is not None:
        if model.__name__ == "BodyScan":
            from app.models.scan import ScanMetric, ScanObservation
            m_doc = db["scan_metrics"].find_one({"scan_id": instance.id})
            if m_doc:
                setattr(instance, "metrics", _dict_to_model(m_doc, ScanMetric))
            obs_docs = list(db["scan_observations"].find({"scan_id": instance.id}))
            setattr(instance, "observations", [_dict_to_model(od, ScanObservation) for od in obs_docs])

    return instance


def _parse_expression(expr: Any, model: Any = None) -> Dict[str, Any]:
    """Convert SQLAlchemy binary, boolean, and unary expressions to MongoDB query dict."""
    from sqlalchemy.sql.elements import BinaryExpression, BooleanClauseList, UnaryExpression
    from sqlalchemy.sql.functions import Function

    if isinstance(expr, BooleanClauseList):
        op_name = getattr(expr.operator, "__name__", str(expr.operator))
        children = [_parse_expression(c, model) for c in expr.clauses]
        valid_children = [c for c in children if c]
        if "or" in op_name:
            return {"$or": valid_children} if valid_children else {}
        # and_
        merged = {}
        for c in valid_children:
            for k, v in c.items():
                if k == "$or":
                    merged.setdefault("$and", []).append({k: v})
                elif k in merged and isinstance(merged[k], dict) and isinstance(v, dict):
                    merged[k].update(v)
                else:
                    merged[k] = v
        return merged

    if isinstance(expr, BinaryExpression):
        is_date_func = False
        if isinstance(expr.left, Function):
            func_name = getattr(expr.left, "name", "").lower()
            if func_name == "date":
                is_date_func = True
            clauses = list(getattr(expr.left, "clauses", []))
            if clauses:
                left_key = getattr(clauses[0], "key", getattr(clauses[0], "name", str(clauses[0])))
            else:
                left_key = getattr(expr.left, "name", "date")
        else:
            left_key = getattr(expr.left, "key", getattr(expr.left, "name", str(expr.left)))

        op_name = getattr(expr.operator, "__name__", str(expr.operator)).lower()
        raw_val = getattr(expr.right, "value", getattr(expr.right, "effective_value", expr.right))

        if is_date_func:
            target_date: date
            if isinstance(raw_val, datetime):
                target_date = raw_val.date()
            elif isinstance(raw_val, date):
                target_date = raw_val
            elif isinstance(raw_val, str):
                target_date = datetime.strptime(raw_val.split("T")[0], "%Y-%m-%d").date()
            else:
                target_date = datetime.utcnow().date()

            start_dt = datetime.combine(target_date, datetime.min.time())
            end_dt = datetime.combine(target_date, datetime.max.time())

            if op_name in ("eq", "__eq__"):
                return {left_key: {"$gte": start_dt, "$lte": end_dt}}
            elif op_name in ("ne", "__ne__"):
                return {"$or": [{left_key: {"$lt": start_dt}}, {left_key: {"$gt": end_dt}}]}
            elif op_name in ("gt", "__gt__"):
                return {left_key: {"$gt": end_dt}}
            elif op_name in ("ge", "__ge__"):
                return {left_key: {"$gte": start_dt}}
            elif op_name in ("lt", "__lt__"):
                return {left_key: {"$lt": start_dt}}
            elif op_name in ("le", "__le__"):
                return {left_key: {"$lte": end_dt}}

        val = _clean_val(raw_val)

        if op_name in ("eq", "__eq__"):
            return {left_key: val}
        elif op_name in ("ne", "__ne__"):
            return {left_key: {"$ne": val}}
        elif op_name in ("gt", "__gt__"):
            return {left_key: {"$gt": val}}
        elif op_name in ("ge", "__ge__"):
            return {left_key: {"$gte": val}}
        elif op_name in ("lt", "__lt__"):
            return {left_key: {"$lt": val}}
        elif op_name in ("le", "__le__"):
            return {left_key: {"$lte": val}}
        elif "in" in op_name and "not" not in op_name:
            val_list = list(val) if isinstance(val, (list, tuple, set)) else [val]
            return {left_key: {"$in": val_list}}
        elif "not" in op_name and "in" in op_name:
            val_list = list(val) if isinstance(val, (list, tuple, set)) else [val]
            return {left_key: {"$nin": val_list}}
        elif "like" in op_name:
            pattern = str(val).strip("%")
            flags = "i" if "ilike" in op_name else ""
            return {left_key: {"$regex": re.escape(pattern), "$options": flags}}
        elif "is" in op_name:
            return {left_key: {"$ne": None} if "not" in op_name else None}
        return {left_key: val}

    if isinstance(expr, UnaryExpression):
        modifier = getattr(expr, "modifier", None)
        operator = getattr(expr, "operator", None)
        mod_name = getattr(modifier, "__name__", str(modifier)).lower() if modifier else ""
        op_name = getattr(operator, "__name__", str(operator)).lower() if operator else ""
        elem = getattr(expr, "element", expr)
        elem_key = getattr(elem, "key", getattr(elem, "name", str(elem)))
        if "not" in mod_name or "inv" in mod_name or "false" in op_name or "not" in op_name or "inv" in op_name:
            return {elem_key: False}
        return {elem_key: True}

    if hasattr(expr, "key"):
        return {expr.key: True}

    if isinstance(expr, dict):
        return expr

    return {}


class MongoQuery:
    """Emulates SQLAlchemy Query interface against a MongoDB collection."""

    def __init__(self, model: Type, session: "MongoSession"):
        self.model = model
        self.session = session
        self.collection_name = _get_collection_name(model)
        self.filters: List[Any] = []
        self.order_bys: List[Any] = []
        self.limit_val: Optional[int] = None
        self.offset_val: Optional[int] = None
        self.joins: List[Any] = []

    def filter(self, *criteria) -> "MongoQuery":
        for c in criteria:
            if c is not None:
                self.filters.append(c)
        return self

    def filter_by(self, **kwargs) -> "MongoQuery":
        for k, v in kwargs.items():
            self.filters.append({k: _clean_val(v)})
        return self

    def join(self, target: Any, onclause: Any = None) -> "MongoQuery":
        self.joins.append((target, onclause))
        return self

    def order_by(self, *clauses) -> "MongoQuery":
        for c in clauses:
            if c is not None:
                self.order_bys.append(c)
        return self

    def limit(self, n: int) -> "MongoQuery":
        self.limit_val = n
        return self

    def offset(self, n: int) -> "MongoQuery":
        self.offset_val = n
        return self

    def _build_filter(self) -> Dict[str, Any]:
        """Construct MongoDB query filter from stored criteria."""
        mongo_filter: Dict[str, Any] = {}

        # Handle joins
        if self.joins:
            db = self.session.get_db()
            for target, onclause in self.joins:
                target_col_name = _get_collection_name(target)
                target_collection = db[target_col_name]
                for f in list(self.filters):
                    parsed = _parse_expression(f, self.model)
                    if "user_id" in parsed and self.collection_name not in ("workouts", "profiles"):
                        user_id = parsed["user_id"]
                        workout_ids = [w["id"] for w in target_collection.find({"user_id": user_id}, {"id": 1})]
                        mongo_filter["workout_id"] = {"$in": workout_ids}

        for f in self.filters:
            parsed = _parse_expression(f, self.model)
            for k, v in parsed.items():
                if k == "$or":
                    mongo_filter["$or"] = v
                elif k in mongo_filter and isinstance(mongo_filter[k], dict) and isinstance(v, dict):
                    mongo_filter[k].update(v)
                else:
                    mongo_filter[k] = v

        return mongo_filter

    def _build_sort(self) -> List[tuple]:
        """Construct PyMongo sort spec."""
        sort_spec = []
        for c in self.order_bys:
            from sqlalchemy.sql.elements import UnaryExpression
            if isinstance(c, UnaryExpression):
                field_name = getattr(c.element, "key", getattr(c.element, "name", str(c.element)))
                direction = pymongo.DESCENDING if "desc" in getattr(c.modifier, "__name__", "") else pymongo.ASCENDING
                sort_spec.append((field_name, direction))
            elif hasattr(c, "key"):
                sort_spec.append((c.key, pymongo.ASCENDING))
            elif isinstance(c, str):
                sort_spec.append((c, pymongo.ASCENDING))
        return sort_spec

    def first(self) -> Optional[Any]:
        db = self.session.get_db()
        collection = db[self.collection_name]
        q_filter = self._build_filter()
        sort_spec = self._build_sort()
        try:
            if sort_spec:
                doc = collection.find_one(q_filter, sort=sort_spec)
            else:
                doc = collection.find_one(q_filter)
            if doc:
                instance = _dict_to_model(doc, self.model, db=db)
                self.session.track(instance)
                return instance
            return None
        except Exception as e:
            logger.error(f"MongoDB find_one error on {self.collection_name}: {e}")
            return None

    def all(self) -> List[Any]:
        db = self.session.get_db()
        collection = db[self.collection_name]
        q_filter = self._build_filter()
        sort_spec = self._build_sort()
        try:
            cursor = collection.find(q_filter)
            if sort_spec:
                cursor = cursor.sort(sort_spec)
            if self.offset_val:
                cursor = cursor.skip(self.offset_val)
            if self.limit_val:
                cursor = cursor.limit(self.limit_val)
            instances = []
            for doc in cursor:
                inst = _dict_to_model(doc, self.model, db=db)
                self.session.track(inst)
                instances.append(inst)
            return instances
        except Exception as e:
            logger.error(f"MongoDB find error on {self.collection_name}: {e}")
            return []

    def count(self) -> int:
        db = self.session.get_db()
        collection = db[self.collection_name]
        q_filter = self._build_filter()
        try:
            return collection.count_documents(q_filter)
        except Exception as e:
            logger.error(f"MongoDB count error on {self.collection_name}: {e}")
            return 0


class MongoSession:
    """Session manager that coordinates MongoDB persistence for models with change tracking."""

    def __init__(self):
        self._db = get_mongo_db()
        self._pending_add: List[Any] = []
        self._pending_delete: List[Any] = []
        self._tracked_instances: Dict[int, Any] = {}
        self._initial_snapshots: Dict[int, Dict[str, Any]] = {}

    def get_db(self):
        return self._db

    def query(self, *models) -> MongoQuery:
        primary_model = models[0]
        return MongoQuery(primary_model, self)

    def track(self, instance: Any) -> None:
        """Register loaded instance for automatic dirty/update persistence on flush/commit."""
        if instance is not None:
            inst_id = id(instance)
            self._tracked_instances[inst_id] = instance
            if inst_id not in self._initial_snapshots:
                self._initial_snapshots[inst_id] = _model_to_dict(instance)

    def add(self, instance: Any) -> None:
        if instance not in self._pending_add:
            self._pending_add.append(instance)
        self.track(instance)

    def add_all(self, instances: List[Any]) -> None:
        for inst in instances:
            self.add(inst)

    def delete(self, instance: Any) -> None:
        if instance not in self._pending_delete:
            self._pending_delete.append(instance)

    def flush(self) -> None:
        """Assign IDs and persist pending operations and dirty tracked instances immediately."""
        # 1. Persist updates ONLY to tracked instances that actually changed
        for inst in list(self._tracked_instances.values()):
            if inst not in self._pending_delete and getattr(inst, "id", None) is not None:
                curr_doc = _model_to_dict(inst)
                init_doc = self._initial_snapshots.get(id(inst))
                if init_doc is None or curr_doc != init_doc:
                    col_name = _get_collection_name(inst)
                    col = self._db[col_name]
                    col.replace_one({"id": inst.id}, curr_doc, upsert=True)
                    self._initial_snapshots[id(inst)] = curr_doc

        # 2. Add new instances
        pending_to_add = list(self._pending_add)
        self._pending_add.clear()
        for inst in pending_to_add:
            col_name = _get_collection_name(inst)
            col = self._db[col_name]
            if getattr(inst, "id", None) is None:
                inst.id = _get_next_id(self._db, col_name)
            doc = _model_to_dict(inst)
            col.replace_one({"id": inst.id}, doc, upsert=True)
            self.track(inst)

        # 3. Delete requested instances
        pending_to_delete = list(self._pending_delete)
        self._pending_delete.clear()
        for inst in pending_to_delete:
            col_name = _get_collection_name(inst)
            col = self._db[col_name]
            if getattr(inst, "id", None) is not None:
                col.delete_one({"id": inst.id})
                self._tracked_instances.pop(id(inst), None)
                self._initial_snapshots.pop(id(inst), None)

    def commit(self) -> None:
        self.flush()

    def rollback(self) -> None:
        self._pending_add.clear()
        self._pending_delete.clear()

    def refresh(self, instance: Any) -> None:
        if getattr(instance, "id", None) is not None:
            col_name = _get_collection_name(instance)
            doc = self._db[col_name].find_one({"id": instance.id})
            if doc:
                for k, v in doc.items():
                    if k != "_id":
                        setattr(instance, k, v)
                self.track(instance)

    def close(self) -> None:
        self._pending_add.clear()
        self._pending_delete.clear()
        self._tracked_instances.clear()


def SessionLocal() -> MongoSession:
    return MongoSession()


def get_db():
    """FastAPI dependency yielding a MongoDB-backed session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
