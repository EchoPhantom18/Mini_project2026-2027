"""
download_rivers.py - Download OpenStreetMap river network for Assam.
Uses Overpass API divided into 1x1 degree bounding boxes to avoid timeouts.
Outputs data/raw/rivers/assam_rivers.geojson.
"""
import os
import json
import urllib.request
import time
from shapely.geometry import LineString
import geopandas as gpd

RIVERS_DIR = r"c:\mini_project\data\raw\rivers"
os.makedirs(RIVERS_DIR, exist_ok=True)
OUT_PATH = os.path.join(RIVERS_DIR, "assam_rivers.geojson")

def download_rivers():
    if os.path.exists(OUT_PATH) and os.path.getsize(OUT_PATH) > 10000:
        print(f"{OUT_PATH} already exists. Skipping download.")
        return

    # Assam bounding box approx: lat 24 to 28, lon 89 to 97
    # Tile by 1x1 degree blocks to keep Overpass queries light and reliable
    tiles = []
    for lat in range(24, 28):
        for lon in range(89, 97):
            tiles.append((lat, lon, lat + 1, lon + 1))

    features = []
    headers = {"User-Agent": "JaldhrishtiFloodProject/1.0 (contact: teamenigma@sih.local)"}
    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]

    print(f"Fetching river network across {len(tiles)} 1-degree tiles...")
    for idx, (min_lat, min_lon, max_lat, max_lon) in enumerate(tiles):
        query = f"""[out:json][timeout:35];
(
  way["waterway"~"river|stream|canal"]({min_lat},{min_lon},{max_lat},{max_lon});
);
out geom;"""
        
        tile_success = False
        for endpoint in endpoints:
            try:
                req = urllib.request.Request(endpoint, data=query.encode("utf-8"), headers=headers)
                with urllib.request.urlopen(req, timeout=40) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    elements = data.get("elements", [])
                    for el in elements:
                        pts = el.get("geometry", [])
                        if len(pts) >= 2:
                            coords = [(p["lon"], p["lat"]) for p in pts]
                            tags = el.get("tags", {})
                            features.append({
                                "geometry": LineString(coords),
                                "properties": {
                                    "osm_id": el.get("id"),
                                    "name": tags.get("name", ""),
                                    "waterway": tags.get("waterway", "river"),
                                }
                            })
                    print(f"  [{idx+1}/{len(tiles)}] Tile ({min_lat}-{max_lat}N, {min_lon}-{max_lon}E): {len(elements)} river segments")
                    tile_success = True
                    break
            except Exception as e:
                # Try next endpoint
                time.sleep(1)
                continue
        
        if not tile_success:
            print(f"  [{idx+1}/{len(tiles)}] Tile ({min_lat}-{max_lat}N, {min_lon}-{max_lon}E): query failed or empty")
        time.sleep(0.5)

    if features:
        gdf = gpd.GeoDataFrame(
            [f["properties"] for f in features],
            geometry=[f["geometry"] for f in features],
            crs="EPSG:4326"
        )
        # Drop duplicates by osm_id if any (across tile boundaries)
        gdf = gdf.drop_duplicates(subset=["osm_id"])
        
        # Clip to Assam boundary
        boundary_path = r"c:\mini_project\data\raw\boundaries\gadm41_IND_2.shp"
        if os.path.exists(boundary_path):
            assam = gpd.read_file(boundary_path)
            assam = assam[assam["NAME_1"] == "Assam"]
            gdf = gpd.clip(gdf, assam)
        
        gdf.to_file(OUT_PATH, driver="GeoJSON")
        print(f"Saved {len(gdf)} river segments to {OUT_PATH}")
    else:
        print("No features downloaded.")

if __name__ == "__main__":
    download_rivers()
