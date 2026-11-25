import urllib.request
import json
import time

query = """[out:json][timeout:15];
way["highway"~"primary|secondary|tertiary|trunk"](26.15,91.73,26.18,91.77);
out geom;"""

servers = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

for s in servers:
    t0 = time.time()
    try:
        req = urllib.request.Request(s, data=query.encode("utf-8"), headers={"User-Agent": "Jaldhrishti/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"SUCCESS {s}: {len(data.get('elements', []))} ways in {time.time()-t0:.2f}s")
            break
    except Exception as e:
        print(f"FAILED {s}: {e}")
