#!/usr/bin/env bash
# Publish the two submission videos as a GitHub Release on the public repo, so
# the Colosseum submission fields can link a URL that plays inline.
#
# Why a Release rather than a committed file:
#   * video/public/live-* is gitignored, and committing ~120MB of MP4s would
#     bloat the repo permanently for every future clone.
#   * raw.githubusercontent.com serves .mp4 as application/octet-stream with
#     `x-content-type-options: nosniff`, which we measured does NOT play on
#     direct navigation; a Release asset streams with `accept-ranges: bytes`
#     and real 206 responses.
# Measured behaviour to rely on: inside a <video src=...> element BOTH routes
# play (readyState 4, currentTime advancing), and a direct click on a Release
# asset downloads rather than starting a broken page. So we ship the Release
# asset and use it as the submission link.
#
# usage: publish_release.sh [tag]
set -euo pipefail

REPO="rafalohaki/solana-programs-lab"
TAG="${1:-iugis-v1}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PITCH="$HERE/video/out/iugis-pitch.mp4"
DEMO="$HERE/video/out/iugis-demo.mp4"

TOKEN="$(python3 -c "
import re
s=open('/root/.config/gh/hosts.yml').read()
m=re.search(r'oauth_token:\s*(\S+)', s)
print(m.group(1) if m else '')
")"
if [ -z "$TOKEN" ]; then
  echo "ERROR: no GitHub token found in ~/.config/gh/hosts.yml" >&2
  exit 1
fi

for f in "$PITCH" "$DEMO"; do
  if [ ! -f "$f" ]; then
    echo "ERROR: missing $f" >&2
    exit 1
  fi
  size=$(stat -c%s "$f")
  # GitHub's hard limit is 100MB per asset. Fail loudly rather than half-publish.
  if [ "$size" -gt 104857600 ]; then
    echo "ERROR: $(basename "$f") is $size bytes (>100MiB GitHub asset limit)" >&2
    exit 1
  fi
  echo "$(basename "$f"): $size bytes  ($(python3 -c "print(f'{$size/1048576:.1f}')") MiB)"
done

api() { curl -sS -m 120 -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }

echo
echo "=== creating release $TAG ==="
existing=$(api "https://api.github.com/repos/$REPO/releases/tags/$TAG" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    print(d.get('id','') if isinstance(d,dict) else '')
except Exception:
    print('')
")
if [ -n "$existing" ]; then
  echo "release $TAG already exists (id=$existing) — reusing it"
  RID="$existing"
else
  RID=$(api -X POST "https://api.github.com/repos/$REPO/releases" \
    -d "{\"tag_name\":\"$TAG\",\"name\":\"Iugis — submission videos\",\"body\":\"Demo and pitch videos for the Iugis Colosseum submission.\\n\\nBoth are H.264/AAC MP4s; they stream with byte-range support, so they play inline in a <video> element rather than downloading.\\n\\nBuilt on Solana devnet with demo data only. No mainnet, no paying customers, no revenue.\",\"draft\":false,\"prerelease\":false}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  echo "created release id=$RID"
fi

if [ -z "$RID" ]; then
  echo "ERROR: could not create or find the release" >&2
  exit 1
fi

upload() {
  local file="$1" name="$2"
  echo
  echo "=== uploading $name ==="
  # Replacing an existing asset requires deleting it first.
  aid=$(api "https://api.github.com/repos/$REPO/releases/$RID/assets" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for a in (d if isinstance(d,list) else []):
    if a.get('name')=='$name': print(a.get('id',''))
" | head -1)
  if [ -n "$aid" ]; then
    echo "deleting existing asset $aid"
    api -X DELETE "https://api.github.com/repos/$REPO/releases/assets/$aid" >/dev/null
  fi
  curl -sS -m 900 -X POST \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: video/mp4" \
    --data-binary "@$file" \
    "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$name" \
    | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'browser_download_url' in d:
    print('OK', d['state'], d['size'], d['content_type'])
    print('URL', d['browser_download_url'])
else:
    print('FAILED', str(d)[:300]); raise SystemExit(1)
"
}

upload "$PITCH" "iugis-pitch.mp4"
upload "$DEMO"  "iugis-demo.mp4"

echo
echo "=== release page ==="
echo "https://github.com/$REPO/releases/tag/$TAG"
