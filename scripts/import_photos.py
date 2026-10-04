#!/usr/bin/env python3
"""Copy castaway photos into the Supabase Storage bucket `contestant-photos`.

For every contestant whose photo_url is not already in our bucket, download the image
(no Referer header: some CDNs block hotlinking), resize to <=600px wide, convert to WebP,
upload to `s<season>/<contestant id>.webp`, and point photo_url at the public URL.
The original page stays in photo_source_url for attribution.

Needs VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in ../.env (never committed).
Usage: scripts/import_photos.py [--dry-run]
"""
import io, sys, time
from pathlib import Path
import requests
from PIL import Image

BUCKET = 'contestant-photos'
MAX_WIDTH = 600
DRY = '--dry-run' in sys.argv

env = {}
for line in (Path(__file__).resolve().parent.parent / '.env').read_text().splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"\'')
url, key = env.get('VITE_SUPABASE_URL', '').rstrip('/'), env.get('SUPABASE_SERVICE_ROLE_KEY', '')
if not url or (not key and not DRY):
    sys.exit('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')

auth = {'apikey': key, 'Authorization': f'Bearer {key}'}
public_prefix = f'{url}/storage/v1/object/public/{BUCKET}/'
UA = {'User-Agent': 'survivor-last-man-standing/1.0 (photo import; personal project)'}

if DRY and not key:  # dry run without a key: read contestants through the public API is blocked by RLS? seasons/contestants are public-read.
    anon = env.get('VITE_SUPABASE_ANON_KEY', '')
    auth = {'apikey': anon, 'Authorization': f'Bearer {anon}'}

rows = requests.get(f'{url}/rest/v1/contestants', headers=auth,
                    params={'select': 'id,name,photo_url,seasons!contestants_season_id_fkey(number)', 'order': 'id'}).json()
if not isinstance(rows, list):
    sys.exit(f'Could not read contestants: {rows}')

done = skipped = 0
for r in rows:
    src = r['photo_url']
    if not src or src.startswith(public_prefix):
        skipped += 1
        continue
    resp = requests.get(src, headers=UA, timeout=30)
    resp.raise_for_status()
    img = Image.open(io.BytesIO(resp.content)).convert('RGB')
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, 'WEBP', quality=82)
    path = f"s{r['seasons']['number']}/{r['id']}.webp"
    print(f"{r['name']}: {img.width}x{img.height} {len(buf.getvalue())//1024}KB -> {path}")
    if not DRY:
        up = requests.post(f'{url}/storage/v1/object/{BUCKET}/{path}', data=buf.getvalue(),
                           headers={**auth, 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000'})
        up.raise_for_status()
        pr = requests.patch(f'{url}/rest/v1/contestants', params={'id': f'eq.{r["id"]}'}, json={'photo_url': public_prefix + path},
                            headers={**auth, 'Content-Type': 'application/json'})
        pr.raise_for_status()
    done += 1
    time.sleep(0.3)
print(f"{'would copy' if DRY else 'copied'} {done}, already done/no photo {skipped}")
