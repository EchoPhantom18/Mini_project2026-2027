"""
Download remaining SRTM tiles (N27-N28 rows) with timeout per tile.
Skips tiles already downloaded.
"""
import os
import urllib.request
import gzip
import shutil
import socket

OUT_DIR = r"c:\mini_project\data\raw\dem"
BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi"

# Set a 60-second timeout per connection
socket.setdefaulttimeout(60)

tiles_needed = []
for lat in range(24, 29):
    for lon in range(89, 97):
        tile_name = f"N{lat:02d}E{lon:03d}"
        tiles_needed.append((tile_name, f"{BASE_URL}/N{lat:02d}/{tile_name}.hgt.gz"))

success = 0
skipped = 0
failed = []

for tile_name, url in tiles_needed:
    hgt_path = os.path.join(OUT_DIR, f"{tile_name}.hgt")

    if os.path.exists(hgt_path) and os.path.getsize(hgt_path) > 1_000_000:
        skipped += 1
        continue

    gz_path = os.path.join(OUT_DIR, f"{tile_name}.hgt.gz")
    print(f"  Downloading {tile_name}...", end=" ", flush=True)

    for attempt in range(3):  # retry up to 3 times
        try:
            urllib.request.urlretrieve(url, gz_path)
            with gzip.open(gz_path, 'rb') as f_in:
                with open(hgt_path, 'wb') as f_out:
                    shutil.copyfileobj(f_in, f_out)
            os.remove(gz_path)
            size_mb = os.path.getsize(hgt_path) / (1024*1024)
            print(f"OK ({size_mb:.1f} MB)")
            success += 1
            break
        except Exception as e:
            if attempt < 2:
                print(f"retry {attempt+2}...", end=" ", flush=True)
            else:
                print(f"FAILED ({e})")
                failed.append(tile_name)
            if os.path.exists(gz_path):
                os.remove(gz_path)
            if os.path.exists(hgt_path):
                os.remove(hgt_path)

print()
print(f"Already had: {skipped}")
print(f"Downloaded:  {success}")
print(f"Failed:      {len(failed)} {failed if failed else ''}")
print(f"Total tiles: {skipped + success}/{len(tiles_needed)}")
