#!/bin/bash
# Sweep an encoded video: sample stills at a fixed interval, then report
#   (a) pixel statistics per still  -> catches blank / near-black frames
#   (b) OCR legacy-brand hits       -> catches the old product name on screen
#   (c) OCR any-text presence       -> catches frames with no captions at all
# usage: verify_video.sh <video> [intervalSec] [outDir]
set -u
V="${1:?video}"; STEP="${2:-5}"; OUT="${3:-/tmp/vv}"
mkdir -p "$OUT"; rm -f "$OUT"/*.png 2>/dev/null

dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$V")
echo "video: $V"
echo "duration: ${dur}s  sampling every ${STEP}s"
echo

# --- container facts ---
ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of default=nw=1 "$V" | sed 's/^/  v: /'
ffprobe -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels -of default=nw=1 "$V" | sed 's/^/  a: /'
echo

t=0
blank=0; legacy=0; notext=0; n=0
while [ "$(echo "$t < $dur" | bc)" = "1" ]; do
  png="$OUT/t${t}.png"
  if ffmpeg -y -v error -i "$V" -ss "$t" -frames:v 1 "$png" 2>/dev/null && [ -f "$png" ]; then
    n=$((n+1))
    stats=$(python3 -c "
from PIL import Image; import numpy as np
a=np.asarray(Image.open('$png').convert('RGB')).astype(float)
print('%.1f %.1f'%(a.mean(),a.std()))
" 2>/dev/null)
    mean=${stats%% *}; std=${stats##* }
    txt=$(tesseract "$png" stdout --psm 6 2>/dev/null)
    # separator-tolerant, trailing-boundary matcher (see tools/scan_brand.sh)
    lh=$(printf '%s' "$txt" | tr 'A-Z' 'a-z' | grep -Eci 'subscriptions[^a-z0-9]{0,4}so[l1]([^a-z0-9]|$)')
    chars=$(printf '%s' "$txt" | tr -cd 'a-zA-Z0-9' | wc -c)
    flag=""
    # background luminance of this composition is ~18-25; a dip to <12 with
    # near-zero variance means the frame went to (near) black.
    if [ "$(echo "$mean < 12" | bc)" = "1" ]; then flag="$flag BLANK(mean=$mean)"; blank=$((blank+1)); fi
    if [ "$lh" -gt 0 ]; then flag="$flag LEGACY=$lh"; legacy=$((legacy+1)); fi
    if [ "$chars" -lt 20 ]; then flag="$flag NO-TEXT(chars=$chars)"; notext=$((notext+1)); fi
    printf "t=%-6s mean=%-7s std=%-6s %s\n" "$t" "$mean" "$std" "${flag:- ok}"
  else
    printf "t=%-6s (extract failed)\n" "$t"
  fi
  t=$((t+STEP))
done
echo
echo "=== summary over $n stills ==="
echo "blank/near-black : $blank"
echo "legacy-brand hits: $legacy"
echo "no-text frames   : $notext"
