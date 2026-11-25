"""
ml/build_features.py - Feature Engineering Pipeline for JALDHRISHTI.

Generates 1km x 1km grid zones across study districts in Assam,
computes static geomorphic features (elevation, slope, river proximity, drainage density),
and joins event-specific satellite flood observations and CHIRPS rainfall.

Output:
- data/processed/assam_1km_grid.geojson: Grid zone geometries & metadata
- data/processed/zone_static_features.csv: Static terrain features per zone
- data/processed/zone_features.csv: Complete training dataset (zone x event)
"""

import os
import glob
import re
from pathlib import Path
import numpy as np
import pandas as pd
import geopandas as gpd
from shapely.geometry import box, Point
from shapely.strtree import STRtree
import rasterio

from ml.config import (
    PROCESSED_DIR,
    BOUNDARIES_DIR,
    DEM_MOSAIC_PATH,
    RIVERS_GEOJSON_PATH,
    FLOOD_EXTENT_DIR,
    RAINFALL_DIR,
    ZONES_GRID_PATH,
    STATIC_FEATURES_PATH,
    TRAINING_DATA_PATH,
    STUDY_DISTRICTS,
    CRS_WGS84,
    CRS_UTM46N,
    GRID_RESOLUTION_M,
    CLEAR_VIEWS_THRESHOLD,
    FLOOD_FRACTION_THRESHOLD,
    FEATURE_COLUMNS,
    TARGET_COLUMN,
    GROUP_COLUMN
)


DISTRICT_PREFIX = {
    "Barpeta": "BARP",
    "Dhemaji": "DHEM",
    "Dhubri": "DHUB",
    "Dima Hasao": "DIMA",
    "Kamrup Metropolitan": "KAMP",
    "Morigaon": "MORI",
    "Nagaon": "NAGA",
}


def create_1km_grid(study_districts=STUDY_DISTRICTS):
    """
    Creates a regular 1 km x 1 km grid covering the study districts.
    Constructed in UTM Zone 46N (meters) for exact metric dimensions,
    then exported in WGS84 (EPSG:4326) for universal GIS and web map compatibility.
    """
    print("=" * 60)
    print("STEP 1: Generating 1 km x 1 km Grid Zones")
    print("=" * 60)

    # 1. Load GADM India Level 2 boundaries and filter to selected Assam districts
    shp_path = BOUNDARIES_DIR / "gadm41_IND_2.shp"
    if not shp_path.exists():
        raise FileNotFoundError(f"District boundaries not found at {shp_path}")

    gadm = gpd.read_file(shp_path)
    assam = gadm[(gadm["NAME_1"] == "Assam") & (gadm["NAME_2"].isin(study_districts))].copy()
    print(f"Loaded {len(assam)} districts: {', '.join(sorted(assam['NAME_2'].tolist()))}")

    # Reproject to metric UTM46N
    assam_utm = assam.to_crs(CRS_UTM46N)

    grid_cells = []
    zone_districts = []
    zone_ids = []

    # 2. Generate regular grid per district
    for _, dist_row in assam_utm.iterrows():
        dname = dist_row["NAME_2"]
        # Explicit district prefix to ensure 100% unique zone IDs across districts
        d_code = DISTRICT_PREFIX.get(dname, dname[:4].upper())

        minx, miny, maxx, maxy = dist_row.geometry.bounds
        xs = np.arange(minx, maxx, GRID_RESOLUTION_M)
        ys = np.arange(miny, maxy, GRID_RESOLUTION_M)

        cell_count = 0
        for x in xs:
            for y in ys:
                cell_geom = box(x, y, x + GRID_RESOLUTION_M, y + GRID_RESOLUTION_M)
                # Only keep cells that intersect the district boundary
                if cell_geom.intersects(dist_row.geometry):
                    grid_cells.append(cell_geom)
                    zone_districts.append(dname)
                    cell_count += 1
                    zone_ids.append(f"{d_code}_{cell_count:04d}")

        print(f"  - {dname}: {cell_count} cells generated")

    grid_utm = gpd.GeoDataFrame(
        {"zone_id": zone_ids, "district": zone_districts},
        geometry=grid_cells,
        crs=CRS_UTM46N
    )

    # Compute centroids in UTM (meters)
    grid_utm["centroid_x_utm"] = grid_utm.geometry.centroid.x
    grid_utm["centroid_y_utm"] = grid_utm.geometry.centroid.y

    # Transform to WGS84 for storage and web map display
    grid_wgs84 = grid_utm.to_crs(CRS_WGS84)
    grid_wgs84["centroid_lon"] = grid_wgs84.geometry.centroid.x
    grid_wgs84["centroid_lat"] = grid_wgs84.geometry.centroid.y

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    grid_wgs84.to_file(ZONES_GRID_PATH, driver="GeoJSON")
    print(f"\nTotal grid zones generated: {len(grid_wgs84)}")
    print(f"Saved grid to: {ZONES_GRID_PATH}")

    return grid_utm, grid_wgs84


def compute_static_features(grid_utm, grid_wgs84):
    """
    Computes region-neutral terrain & hydrological features for every zone:
    - elevation_mean, elevation_min (meters from SRTM DEM)
    - slope_mean (degrees from terrain gradient)
    - dist_to_river_m (distance to nearest river centerline in meters)
    - drainage_density (river length inside cell / cell area)
    """
    print("\n" + "=" * 60)
    print("STEP 2: Computing Static Terrain & Hydrology Features")
    print("=" * 60)

    if not DEM_MOSAIC_PATH.exists():
        raise FileNotFoundError(f"DEM mosaic not found at {DEM_MOSAIC_PATH}")
    if not RIVERS_GEOJSON_PATH.exists():
        raise FileNotFoundError(f"Rivers geojson not found at {RIVERS_GEOJSON_PATH}")

    n_zones = len(grid_utm)
    cx_utm = grid_utm["centroid_x_utm"].values
    cy_utm = grid_utm["centroid_y_utm"].values
    d = 250.0  # offset in meters for sampling quadrant points inside 1km cell

    # Define 5 sampling coordinates per zone in UTM46N:
    # 0: center, 1: north, 2: south, 3: east, 4: west
    pts_c = gpd.GeoSeries([Point(x, y) for x, y in zip(cx_utm, cy_utm)], crs=CRS_UTM46N).to_crs(CRS_WGS84)
    pts_n = gpd.GeoSeries([Point(x, y + d) for x, y in zip(cx_utm, cy_utm)], crs=CRS_UTM46N).to_crs(CRS_WGS84)
    pts_s = gpd.GeoSeries([Point(x, y - d) for x, y in zip(cx_utm, cy_utm)], crs=CRS_UTM46N).to_crs(CRS_WGS84)
    pts_e = gpd.GeoSeries([Point(x + d, y) for x, y in zip(cx_utm, cy_utm)], crs=CRS_UTM46N).to_crs(CRS_WGS84)
    pts_w = gpd.GeoSeries([Point(x - d, y) for x, y in zip(cx_utm, cy_utm)], crs=CRS_UTM46N).to_crs(CRS_WGS84)

    coords_c = [(p.x, p.y) for p in pts_c]
    coords_n = [(p.x, p.y) for p in pts_n]
    coords_s = [(p.x, p.y) for p in pts_s]
    coords_e = [(p.x, p.y) for p in pts_e]
    coords_w = [(p.x, p.y) for p in pts_w]

    print("Sampling elevation from SRTM DEM...")
    with rasterio.open(DEM_MOSAIC_PATH) as dem_src:
        elev_c = np.array([s[0] for s in dem_src.sample(coords_c)], dtype=float)
        elev_n = np.array([s[0] for s in dem_src.sample(coords_n)], dtype=float)
        elev_s = np.array([s[0] for s in dem_src.sample(coords_s)], dtype=float)
        elev_e = np.array([s[0] for s in dem_src.sample(coords_e)], dtype=float)
        elev_w = np.array([s[0] for s in dem_src.sample(coords_w)], dtype=float)

    # Stack sample points to compute mean and min elevation
    elev_stack = np.vstack([elev_c, elev_n, elev_s, elev_e, elev_w])
    # Replace negative nodata values (e.g. -32768) if any with 0
    elev_stack[elev_stack < -100] = 0

    elev_mean = np.mean(elev_stack, axis=0)
    elev_min = np.min(elev_stack, axis=0)

    # Compute terrain slope (degrees) using central differences
    # dx = 2 * d = 500m, dy = 2 * d = 500m
    dz_dx = (elev_e - elev_w) / (2.0 * d)
    dz_dy = (elev_n - elev_s) / (2.0 * d)
    slope_rad = np.arctan(np.sqrt(dz_dx**2 + dz_dy**2))
    slope_deg = np.degrees(slope_rad)

    print("Computing distance to nearest river & drainage density...")
    rivers = gpd.read_file(RIVERS_GEOJSON_PATH).to_crs(CRS_UTM46N)
    river_tree = STRtree(rivers.geometry.values)

    # 1. Shortest distance from zone centroid to river (in meters)
    centroids_utm_pts = [Point(x, y) for x, y in zip(cx_utm, cy_utm)]
    nearest_idx = river_tree.nearest(centroids_utm_pts)
    dist_to_river = np.array([
        river_tree.geometries[nearest_idx[i]].distance(centroids_utm_pts[i])
        for i in range(n_zones)
    ])

    # 2. Drainage density: river length inside cell (km) / cell area (1 km^2)
    # Perform spatial overlay to compute exact intersecting river lengths
    rivers_in_grid = gpd.overlay(rivers[["geometry"]], grid_utm[["zone_id", "geometry"]], how="intersection")
    rivers_in_grid["length_km"] = rivers_in_grid.geometry.length / 1000.0
    drainage_sum = rivers_in_grid.groupby("zone_id")["length_km"].sum().to_dict()
    drainage_density = np.array([drainage_sum.get(zid, 0.0) for zid in grid_utm["zone_id"]])

    static_df = pd.DataFrame({
        "zone_id": grid_utm["zone_id"],
        "district": grid_utm["district"],
        "elevation_mean": np.round(elev_mean, 2),
        "elevation_min": np.round(elev_min, 2),
        "slope_mean": np.round(slope_deg, 2),
        "dist_to_river_m": np.round(dist_to_river, 1),
        "drainage_density": np.round(drainage_density, 3),
        "centroid_lon": grid_wgs84["centroid_lon"],
        "centroid_lat": grid_wgs84["centroid_lat"]
    })

    static_df.to_csv(STATIC_FEATURES_PATH, index=False)
    print(f"Saved static features for {len(static_df)} zones to: {STATIC_FEATURES_PATH}")
    print("\nStatic features summary:")
    print(static_df[["elevation_mean", "slope_mean", "dist_to_river_m", "drainage_density"]].describe())

    return static_df, (coords_c, coords_n, coords_s, coords_e, coords_w)


def build_event_training_data(static_df, sample_coords):
    """
    Pairs each zone with real satellite flood observations and CHIRPS rainfall
    across all 27 downloaded flood events.
    Outputs the final zone_features.csv for model training.
    """
    print("\n" + "=" * 60)
    print("STEP 3: Extracting Dynamic Features & Flood Labels from Real Events")
    print("=" * 60)

    flood_files = sorted(glob.glob(str(FLOOD_EXTENT_DIR / "*.tif")))
    rain_files = sorted(glob.glob(str(RAINFALL_DIR / "*.tif")))

    if not flood_files:
        raise FileNotFoundError(f"No flood rasters found in {FLOOD_EXTENT_DIR}")
    if not rain_files:
        raise FileNotFoundError(f"No rainfall rasters found in {RAINFALL_DIR}")

    print(f"Found {len(flood_files)} flood extent rasters and {len(rain_files)} rainfall rasters.")

    # Map event ID / date from flood files to rain files
    # Filename formats:
    # flood_label_YYYYMMDD_DFO_XXXX_...
    # rain_YYYYMMDD_DFO_XXXX_...
    event_pairs = []
    for ff in flood_files:
        fname = Path(ff).name
        # Extract date tag and event ID
        match = re.search(r"flood_label_(\d{8})_(DFO_\d+)", fname)
        if match:
            date_tag, dfo_id = match.groups()
            # Find matching rainfall file
            matching_rain = [rf for rf in rain_files if f"rain_{date_tag}_{dfo_id}" in rf]
            if matching_rain:
                event_pairs.append((date_tag, dfo_id, ff, matching_rain[0]))

    print(f"Matched {len(event_pairs)} event pairs across flood and rainfall datasets.")

    coords_c, coords_n, coords_s, coords_e, coords_w = sample_coords
    n_zones = len(static_df)

    training_rows = []
    total_flooded_samples = 0
    total_valid_samples = 0

    for idx, (date_tag, event_id, flood_path, rain_path) in enumerate(event_pairs, 1):
        # 1. Sample rainfall from 3 bands (rain_7d, rain_15d, rain_30d) at zone centroids
        with rasterio.open(rain_path) as rain_src:
            rain_samples = list(rain_src.sample(coords_c))
            r7 = np.array([s[0] for s in rain_samples], dtype=float)
            r15 = np.array([s[1] for s in rain_samples], dtype=float)
            r30 = np.array([s[2] for s in rain_samples], dtype=float)

        # 2. Sample flood extent and clear_views QA from 2 bands at 5 points per cell
        with rasterio.open(flood_path) as flood_src:
            f_c = np.array(list(flood_src.sample(coords_c)))
            f_n = np.array(list(flood_src.sample(coords_n)))
            f_s = np.array(list(flood_src.sample(coords_s)))
            f_e = np.array(list(flood_src.sample(coords_e)))
            f_w = np.array(list(flood_src.sample(coords_w)))

        # Stack into shape (5, n_zones, 2) where band 0 = label, band 1 = clear_views
        f_stack = np.stack([f_c, f_n, f_s, f_e, f_w], axis=0)
        labels = f_stack[:, :, 0]
        clear_views = f_stack[:, :, 1]

        # Valid mask: observation passes clear views threshold (>= 3)
        valid_obs = (clear_views >= CLEAR_VIEWS_THRESHOLD)
        valid_counts = valid_obs.sum(axis=0)

        # Flooded points where valid
        flooded_counts = ((labels == 1) & valid_obs).sum(axis=0)

        # Compute flood fraction among reliable observation points
        # If no clear views (all cloudy / unobserved), zone is marked invalid for this event
        is_observed = (valid_counts >= 1)
        flood_fraction = np.zeros(n_zones, dtype=float)
        flood_fraction[is_observed] = flooded_counts[is_observed] / valid_counts[is_observed]

        # Binary flood target label
        target = np.zeros(n_zones, dtype=int)
        target[is_observed & (flood_fraction >= FLOOD_FRACTION_THRESHOLD)] = 1

        # Keep all reliably observed zones for training
        valid_indices = np.where(is_observed)[0]
        n_valid = len(valid_indices)
        n_flood = target[valid_indices].sum()

        total_valid_samples += n_valid
        total_flooded_samples += n_flood

        event_df = pd.DataFrame({
            "zone_id": static_df["zone_id"].iloc[valid_indices],
            "district": static_df["district"].iloc[valid_indices],
            "event_id": event_id,
            "event_date": f"{date_tag[:4]}-{date_tag[4:6]}-{date_tag[6:]}",
            "elevation_mean": static_df["elevation_mean"].iloc[valid_indices],
            "elevation_min": static_df["elevation_min"].iloc[valid_indices],
            "slope_mean": static_df["slope_mean"].iloc[valid_indices],
            "dist_to_river_m": static_df["dist_to_river_m"].iloc[valid_indices],
            "drainage_density": static_df["drainage_density"].iloc[valid_indices],
            "rain_7d_mm": np.round(r7[valid_indices], 1),
            "rain_15d_mm": np.round(r15[valid_indices], 1),
            "rain_30d_mm": np.round(r30[valid_indices], 1),
            TARGET_COLUMN: target[valid_indices]
        })

        training_rows.append(event_df)
        print(f"  [{idx:02d}/{len(event_pairs)}] {event_id} ({date_tag}): {n_valid} valid zones, {n_flood} flooded zones")

    dataset = pd.concat(training_rows, ignore_index=True)
    dataset.to_csv(TRAINING_DATA_PATH, index=False)

    print("\n" + "=" * 60)
    print("FEATURE EXTRACTION COMPLETE")
    print("=" * 60)
    print(f"Total training observations: {len(dataset):,}")
    print(f"Flooded samples (positive class): {total_flooded_samples:,} ({total_flooded_samples/len(dataset)*100:.2f}%)")
    print(f"Non-flooded samples (negative class): {len(dataset) - total_flooded_samples:,}")
    print(f"Districts in dataset: {dataset['district'].nunique()}")
    print(f"Saved dataset to: {TRAINING_DATA_PATH}")

    return dataset


def run_pipeline():
    """Main execution orchestrator for feature building."""
    grid_utm, grid_wgs84 = create_1km_grid()
    static_df, sample_coords = compute_static_features(grid_utm, grid_wgs84)
    dataset = build_event_training_data(static_df, sample_coords)
    return dataset


if __name__ == "__main__":
    run_pipeline()
