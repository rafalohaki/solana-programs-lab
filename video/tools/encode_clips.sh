#!/bin/bash
# Encode a captured JPEG frame sequence into the Remotion-consumable clip profile.
#
#   encode_clips.sh [srcDir] [dstDir]
#
# The capture writes f0000.jpg..fNNNN.jpg at 1600x900. This encodes each clip to
# H.264 / yuvj420p / 30fps / CRF 17, matching the profile the existing
# live-mp4 clips use (and that has already been verified to render in Remotion).
#
# yuvj420p (full-range) is deliberate: the source frames are JPEGs, so full-range
# keeps the colours bit-for-bit rather than round-tripping through limited range.
#
# IMPORTANT: the number of encoded frames must be >= the authored clipFrames for
# each clip, otherwise the consuming scene tail freezes (the scene rate formula is
# min(1, clipFrames/dur), which only degrades safely for a LONGER clip).
set -u
SRC="${1:-/root/hackathon/solana-programs-lab/video/public/live-v2}"
DST="${2:-/root/hackathon/solana-programs-lab/video/public/live-mp4}"

# authored per-clip frame counts the Remotion scenes expect
declare -A NEED=(
  [plans]=330 [proofs]=300 [agent]=260 [checkout]=300
  [merchant]=330 [manage]=270 [blink]=270 [examples]=270
)

mkdir -p "$DST"
fail=0
for clip in plans proofs agent checkout merchant manage blink examples; do
  d="$SRC/$clip"
  [ -d "$d" ] || { echo "MISSING DIR  $clip"; fail=1; continue; }
  first=$(ls "$d" | sort | head -1)
  n=$(ls "$d"/*.jpg 2>/dev/null | wc -l)
  need=${NEED[$clip]}
  if [ "$n" -eq 0 ]; then echo "EMPTY        $clip"; fail=1; continue; fi

  ffmpeg -y -v error -framerate 30 -start_number 0 -i "$d/f%04d.jpg" \
    -c:v libx264 -preset slow -crf 17 -pix_fmt yuvj420p -r 30 \
    -movflags +faststart "$DST/$clip.mp4" 2>&1 | tail -3
  rc=${PIPESTATUS[0]}

  got=$(ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames \
        -of default=nw=1:nk=1 "$DST/$clip.mp4" 2>/dev/null)
  dims=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height \
        -of csv=p=0:s=x "$DST/$clip.mp4" 2>/dev/null)

  status=ok
  [ "$rc" != "0" ] && { status="FFMPEG-FAIL(rc=$rc)"; fail=1; }
  if [ -n "$got" ] && [ "$got" -lt "$need" ]; then status="TOO-SHORT(want>=$need)"; fail=1; fi

  printf "%-9s frames=%-5s encoded=%-5s dims=%-10s %s\n" "$clip" "$n" "$got" "$dims" "$status"
done

echo
if [ "$fail" = "0" ]; then echo "ALL CLIPS OK"; else echo "PROBLEMS FOUND"; fi
exit $fail
