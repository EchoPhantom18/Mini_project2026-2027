import urllib.request
import re

url = "https://download.geofabrik.de/asia/india.html"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=10) as resp:
    text = resp.read().decode("utf-8")
    matches = re.findall(r'href="([^"]+)"', text)
    pbf_matches = [m for m in matches if "osm" in m or "pbf" in m or "shp" in m]
    print("Found links:", pbf_matches[:20])
