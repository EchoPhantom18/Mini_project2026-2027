import urllib.request
import time

# Central Guwahati bbox: (min_lon, min_lat, max_lon, max_lat)
url = "https://api.openstreetmap.org/api/0.6/map?bbox=91.70,26.12,91.80,26.20"
print(f"Querying official OSM REST API: {url}...")
t0 = time.time()
req = urllib.request.Request(url, headers={"User-Agent": "JaldhrishtiRouter/1.0"})
try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        content = resp.read()
        print(f"SUCCESS in {time.time()-t0:.2f}s! Received {len(content)/(1024*1024):.2f} MB XML data.")
        with open(r"c:\mini_project\data\raw\roads\guwahati_osm.xml", "wb") as f:
            f.write(content)
        print("Saved OSM XML to c:\\mini_project\\data\\raw\\roads\\guwahati_osm.xml")
except Exception as e:
    print(f"Failed: {e}")
