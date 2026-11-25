-- ===========================================================================
-- JALDHRISHTI — PostgreSQL + PostGIS Database Schema
-- Smart India Hackathon (Team Enigma)
-- ===========================================================================

-- 1. Enable PostGIS Spatial Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Drop existing tables if re-initializing
DROP TABLE IF EXISTS sos_requests CASCADE;
DROP TABLE IF EXISTS shelters CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

-- ===========================================================================
-- TABLE 1: zones
-- Represents 1 km x 1 km grid zones with terrain features and spatial boundaries
-- ===========================================================================
CREATE TABLE zones (
    zone_id VARCHAR(32) PRIMARY KEY,
    district VARCHAR(64) NOT NULL,
    geom geometry(Polygon, 4326) NOT NULL,
    centroid_lat DOUBLE PRECISION NOT NULL,
    centroid_lon DOUBLE PRECISION NOT NULL,
    elevation_mean DOUBLE PRECISION NOT NULL,
    elevation_min DOUBLE PRECISION NOT NULL,
    slope_mean DOUBLE PRECISION NOT NULL,
    dist_to_river_m DOUBLE PRECISION NOT NULL,
    drainage_density DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial GIST index for fast polygon intersection and bounding box queries
CREATE INDEX idx_zones_geom ON zones USING GIST (geom);
CREATE INDEX idx_zones_district ON zones (district);

COMMENT ON TABLE zones IS '1 km x 1 km flood assessment grid zones across Assam study districts.';
COMMENT ON COLUMN zones.elevation_mean IS 'Mean elevation in meters from SRTM DEM.';
COMMENT ON COLUMN zones.slope_mean IS 'Mean terrain slope in degrees.';
COMMENT ON COLUMN zones.dist_to_river_m IS 'Shortest distance in meters to nearest river centerline.';
COMMENT ON COLUMN zones.drainage_density IS 'River length inside zone (km) / cell area (km^2).';


-- ===========================================================================
-- TABLE 2: shelters
-- Designated emergency relief shelters, stadiums, schools, and elevated camps
-- ===========================================================================
CREATE TABLE shelters (
    id SERIAL PRIMARY KEY,
    name VARCHAR(128) NOT NULL,
    district VARCHAR(64) NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    current_occupancy INTEGER NOT NULL DEFAULT 0 CHECK (current_occupancy >= 0),
    elevation_m DOUBLE PRECISION NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Full', 'Inactive')),
    contact_person VARCHAR(64),
    contact_phone VARCHAR(32),
    zone_id VARCHAR(32) REFERENCES zones(zone_id) ON DELETE SET NULL,
    is_simulated BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial GIST index for nearest-neighbor distance searches
CREATE INDEX idx_shelters_geom ON shelters USING GIST (geom);
CREATE INDEX idx_shelters_status ON shelters (status);
CREATE INDEX idx_shelters_district ON shelters (district);

COMMENT ON TABLE shelters IS 'Emergency relief shelters with capacity, physical elevation, and status.';


-- ===========================================================================
-- TABLE 3: sos_requests
-- Citizen distress submissions with location, vulnerability, and urgency score
-- ===========================================================================
CREATE TABLE sos_requests (
    id SERIAL PRIMARY KEY,
    citizen_name VARCHAR(128) NOT NULL,
    phone VARCHAR(32) NOT NULL,
    geom geometry(Point, 4326) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    zone_id VARCHAR(32) REFERENCES zones(zone_id) ON DELETE SET NULL,
    people_count INTEGER NOT NULL DEFAULT 1 CHECK (people_count > 0),
    has_elderly BOOLEAN NOT NULL DEFAULT FALSE,
    has_infants BOOLEAN NOT NULL DEFAULT FALSE,
    has_medical_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    water_depth_level VARCHAR(32) NOT NULL CHECK (water_depth_level IN ('Ankle', 'Knee', 'Waist', 'Chest', 'Submerged')),
    urgency_score DOUBLE PRECISION NOT NULL DEFAULT 0.0 CHECK (urgency_score >= 0.0 AND urgency_score <= 100.0),
    status VARCHAR(32) NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Dispatched', 'Rescued', 'Cancelled')),
    assigned_team VARCHAR(64),
    estimated_eta_min INTEGER,
    notes TEXT,
    is_simulated BOOLEAN NOT NULL DEFAULT TRUE,  -- Rule 3: demo SOS records must be explicitly marked SIMULATED
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Spatial GIST index for proximity and heatmaps
CREATE INDEX idx_sos_geom ON sos_requests USING GIST (geom);
CREATE INDEX idx_sos_urgency ON sos_requests (urgency_score DESC);
CREATE INDEX idx_sos_status ON sos_requests (status);
CREATE INDEX idx_sos_zone ON sos_requests (zone_id);

COMMENT ON TABLE sos_requests IS 'Citizen SOS rescue requests with vulnerability parameters and computed urgency score.';
COMMENT ON COLUMN sos_requests.is_simulated IS 'Flags whether the SOS request is simulated/demo data (Rule 3).';
