import urllib.request
import urllib.parse
import json
import time

query = """[out:json][timeout:35];
(
  way["highway"~"motorway|trunk|primary|secondary|tertiary|residential"](26.09,91.64,26.21,91.85);
);
out geom;"""

post_data = urllib.parse.urlencode({"data": query}).encode("utf-8")
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "Content-Type": "application/x-www-form-urlencoded"
}

endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

for ep in endpoints:
    print(f"Testing {ep} with properly URL-encoded data...", flush=True)
    t0 = time.time()
    try:
        req = urllib.request.Request(ep, data=post_data, headers=headers)
        with urllib.request.urlopen(req, timeout=35) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elements = data.get("elements", [])
            print(f"  SUCCESS on {ep}: {len(elements)} road ways in {time.time()-t0:.2f}s!", flush=True)
            with open(r"c:\mini_project\data\processed\guwahati_osm_ways.json", "w") as f:
                json.dump(data, f)
            print("Saved ways to data/processed/guwahati_osm_ways.json")
            break
    except Exception as e:
        print(f"  Failed on {ep}: {e} ({time.time()-t0:.2f}s)", flush=True)
