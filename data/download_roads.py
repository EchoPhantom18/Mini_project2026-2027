"""
data/download_roads.py - Download Guwahati arterial & primary/secondary road network.
Saves to data/processed/guwahati_roads.graphml.
"""
import time
from pathlib import Path
import osmnx as ox

OUT_PATH = Path(r"c:\mini_project\data\processed\guwahati_roads.graphml")

def download():
    if OUT_PATH.exists() and OUT_PATH.stat().st_size > 50000:
        print(f"Graph already exists at {OUT_PATH}. Skipping download.")
        return

    # Guwahati urban bounding box (left, bottom, right, top)
    bbox = (91.60, 26.08, 91.85, 26.22)
    # Target all major drivable roads (highways, trunks, primary, secondary, tertiary, residential)
    custom_filter = '["highway"~"motorway|trunk|primary|secondary|tertiary|residential"]'

    endpoints = [
        "https://overpass-api.de/api/interpreter",
        "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter"
    ]

    success = False
    for ep in endpoints:
        print(f"Attempting download via {ep}...", flush=True)
        ox.settings.overpass_url = ep
        ox.settings.timeout = 45
        t0 = time.time()
        try:
            G = ox.graph.graph_from_bbox(bbox=bbox, custom_filter=custom_filter, simplify=True)
            print(f"Downloaded graph in {time.time()-t0:.1f}s! Nodes: {len(G.nodes)}, Edges: {len(G.edges)}", flush=True)
            OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
            ox.save_graphml(G, OUT_PATH)
            print(f"Successfully saved road graph to {OUT_PATH}", flush=True)
            success = True
            break
        except Exception as e:
            print(f"Failed on {ep}: {e}", flush=True)

    if not success:
        print("Could not download from Overpass mirrors.", flush=True)

if __name__ == "__main__":
    download()
