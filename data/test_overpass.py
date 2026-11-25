import urllib.request
import json
import time

# Central Guwahati: lat 26.12 to 26.20, lon 91.70 to 91.80
# Query only primary, secondary, trunk highways
query = """[out:json][timeout:25];
(
  way["highway"~"motorway|trunk|primary|secondary"](26.12, 91.70, 26.20, 91.80);
);
out body;
>;
out skel qt;"""

endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
]

for ep in endpoints:
    print(f"Testing {ep}...", flush=True)
    t0 = time.time()
    try:
        req = urllib.request.Request(
            ep,
            data=query.encode("utf-8"),
            headers={"User-Agent": "JaldhrishtiRouter/1.0"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            elements = data.get("elements", [])
            print(f"  SUCCESS on {ep}: {len(elements)} elements ({time.time()-t0:.2f}s)", flush=True)
            break
    except Exception as e:
        print(f"  FAILED on {ep}: {e} ({time.time()-t0:.2f}s)", flush=True)
