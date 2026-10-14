from sqlalchemy import Column, Integer, String, ForeignKey, Float, DateTime, JSON, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class BodyScan(Base):
    __tablename__ = "body_scans"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=False)
    scan_date = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    status = Column(String, default="COMPLETED")  # COMPLETED, INSUFFICIENT_DATA, FAILED
    confidence = Column(Float, default=0.0)
    model_version = Column(String, default="fortis-vision-v1.0")
    limitations = Column(JSON, default=list)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    metrics = relationship("ScanMetric", back_populates="scan", uselist=False, cascade="all, delete-orphan")
    observations = relationship("ScanObservation", back_populates="scan", cascade="all, delete-orphan")


class ScanMetric(Base):
    __tablename__ = "scan_metrics"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("body_scans.id", ondelete="CASCADE"), nullable=False, index=True)
    movement_quality = Column(Float, nullable=False)
    mobility = Column(Float, nullable=False)
    stability = Column(Float, nullable=False)
    movement_consistency = Column(Float, nullable=False)
    symmetry_indicator = Column(Float, nullable=False)
    squat_movement_score = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)
    joint_angles = Column(JSON, default=dict)
    functional_metrics = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    scan = relationship("BodyScan", back_populates="metrics")


class ScanObservation(Base):
    __tablename__ = "scan_observations"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("body_scans.id", ondelete="CASCADE"), nullable=False, index=True)
    category = Column(String, nullable=False)  # FORM, MOBILITY, STABILITY, SYMMETRY, LIMITATION
    status = Column(String, default="POSITIVE")  # POSITIVE (✓), ATTENTION (⚠), NEUTRAL
    text = Column(String, nullable=False)
    joint_affected = Column(String, nullable=True)  # hip, knee, spine, ankle, torso
    severity = Column(String, default="low")  # low, medium, high
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    scan = relationship("BodyScan", back_populates="observations")


class ScanComparison(Base):
    __tablename__ = "scan_comparisons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    previous_scan_id = Column(Integer, ForeignKey("body_scans.id"), nullable=False)
    current_scan_id = Column(Integer, ForeignKey("body_scans.id"), nullable=False)
    metrics_delta = Column(JSON, nullable=False)  # {"movement_quality": +7, "mobility": +6, ...}
    what_changed = Column(JSON, nullable=False)  # list of supported observations
    comparison_date = Column(DateTime(timezone=True), server_default=func.now())
