"""
backend/db/models.py - SQLAlchemy ORM Models for JALDHRISHTI Database.

Defines:
- Zone: 1 km grid zones with terrain features and polygon geometry
- Shelter: Evacuation relief centers with capacity and elevation
- SOSRequest: Citizen distress requests with urgency score and vulnerability flags
"""

from datetime import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Boolean,
    Text,
    DateTime,
    ForeignKey,
    CheckConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Zone(Base):
    """Represents a 1 km x 1 km grid zone with geomorphic features."""
    __tablename__ = "zones"

    zone_id = Column(String(32), primary_key=True, index=True)
    district = Column(String(64), nullable=False, index=True)
    centroid_lat = Column(Float, nullable=False)
    centroid_lon = Column(Float, nullable=False)
    elevation_mean = Column(Float, nullable=False)
    elevation_min = Column(Float, nullable=False)
    slope_mean = Column(Float, nullable=False)
    dist_to_river_m = Column(Float, nullable=False)
    drainage_density = Column(Float, nullable=False)
    geojson_geometry = Column(Text, nullable=False)  # GeoJSON string representation of Polygon
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    shelters = relationship("Shelter", back_populates="zone", cascade="all, delete-orphan")
    sos_requests = relationship("SOSRequest", back_populates="zone", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "zone_id": self.zone_id,
            "district": self.district,
            "centroid_lat": self.centroid_lat,
            "centroid_lon": self.centroid_lon,
            "elevation_mean": self.elevation_mean,
            "elevation_min": self.elevation_min,
            "slope_mean": self.slope_mean,
            "dist_to_river_m": self.dist_to_river_m,
            "drainage_density": self.drainage_density,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Shelter(Base):
    """Emergency evacuation shelter."""
    __tablename__ = "shelters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    district = Column(String(64), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    capacity = Column(Integer, nullable=False)
    current_occupancy = Column(Integer, default=0, nullable=False)
    elevation_m = Column(Float, nullable=False)
    status = Column(String(32), default="Active", nullable=False, index=True)  # Active, Full, Inactive
    contact_person = Column(String(64), nullable=True)
    contact_phone = Column(String(32), nullable=True)
    zone_id = Column(String(32), ForeignKey("zones.zone_id"), nullable=True, index=True)
    is_simulated = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    zone = relationship("Zone", back_populates="shelters")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "district": self.district,
            "lat": self.lat,
            "lon": self.lon,
            "capacity": self.capacity,
            "current_occupancy": self.current_occupancy,
            "available_capacity": max(0, self.capacity - self.current_occupancy),
            "elevation_m": self.elevation_m,
            "status": self.status,
            "contact_person": self.contact_person,
            "contact_phone": self.contact_phone,
            "zone_id": self.zone_id,
            "is_simulated": self.is_simulated,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class SOSRequest(Base):
    """Citizen distress call submission."""
    __tablename__ = "sos_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    citizen_name = Column(String(128), nullable=False)
    phone = Column(String(32), nullable=False)
    lat = Column(Float, nullable=False)
    lon = Column(Float, nullable=False)
    zone_id = Column(String(32), ForeignKey("zones.zone_id"), nullable=True, index=True)
    people_count = Column(Integer, default=1, nullable=False)
    has_elderly = Column(Boolean, default=False, nullable=False)
    has_infants = Column(Boolean, default=False, nullable=False)
    has_medical_emergency = Column(Boolean, default=False, nullable=False)
    water_depth_level = Column(String(32), nullable=False)  # Ankle, Knee, Waist, Chest, Submerged
    urgency_score = Column(Float, default=0.0, nullable=False, index=True)  # 0.0 to 100.0
    status = Column(String(32), default="Pending", nullable=False, index=True)  # Pending, Dispatched, Rescued, Cancelled
    assigned_team = Column(String(64), nullable=True)
    estimated_eta_min = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    is_simulated = Column(Boolean, default=True, nullable=False)  # Rule 3 requirement
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    zone = relationship("Zone", back_populates="sos_requests")

    def to_dict(self):
        return {
            "id": self.id,
            "citizen_name": self.citizen_name,
            "phone": self.phone,
            "lat": self.lat,
            "lon": self.lon,
            "zone_id": self.zone_id,
            "people_count": self.people_count,
            "has_elderly": self.has_elderly,
            "has_infants": self.has_infants,
            "has_medical_emergency": self.has_medical_emergency,
            "water_depth_level": self.water_depth_level,
            "urgency_score": round(self.urgency_score, 1),
            "status": self.status,
            "assigned_team": self.assigned_team,
            "estimated_eta_min": self.estimated_eta_min,
            "notes": self.notes,
            "is_simulated": self.is_simulated,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }
