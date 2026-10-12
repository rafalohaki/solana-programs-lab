#!/bin/bash
# OCR-scan one captured frame for the legacy brand name.
#   usage: scan_brand.sh <clip> <frameIndex> [srcDir] [crop]
# Prints: "<clip> <frame> <legacyHits>"
# srcDir defaults to $SCAN_DIR or video/public/live-v2
# crop   defaults to $SCAN_CROP or "" (full frame, 1600x900)
set -u
f="${1:?clip}"; i="${2:?frame}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC_DIR="${3:-${SCAN_DIR:-$ROOT/video/public/live-v2}}"
CROP="${4:-${SCAN_CROP:-}}"
src="$(printf '%s/%s/f%04d.jpg' "$SRC_DIR" "$f" "$i")"
[ -f "$src" ] || exit 0
tmp="$(mktemp /tmp/sb_XXXXXX.png)"
if [ -n "$CROP" ]; then
  ffmpeg -y -v error -i "$src" -vf "crop=$CROP" "$tmp" 2>/dev/null || { rm -f "$tmp"; exit 0; }
else
  ffmpeg -y -v error -i "$src" "$tmp" 2>/dev/null || { rm -f "$tmp"; exit 0; }
fi
# Match the legacy brand, tolerating OCR noise but NOT creating false positives.
# Lowercase first, then an ERE that allows a few separator chars between
# "subscriptions" and "sol" ("Subscriptions.sol", "subscriptions . sol") and
# accepts OCR's l/1 confusion ("Subscriplions.so1"), while requiring a word
# boundary after "sol" so that "subscriptions SOLANA..." does NOT match.
# Deliberately not a BRE-based `\.?`: `?` is a LITERAL in BRE, so patterns like
# `\.?` silently match nothing and report everything clean.
hit=$(tesseract "$tmp" stdout --psm 6 2>/dev/null \
  | tr 'A-Z' 'a-z' \
  | grep -Eci 'subscriptions[^a-z0-9]{0,4}so[l1]([^a-z0-9]|$)')
rm -f "$tmp"
echo "$f $i $hit"
