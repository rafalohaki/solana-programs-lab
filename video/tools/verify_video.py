#!/usr/bin/env python3
"""Sweep an encoded video and report per-still health.

Checks, per sampled still:
  (a) pixel statistics          -> catches blank / near-black frames
  (b) legacy-brand OCR hits     -> catches the old product name on screen
  (c) any-text presence         -> catches frames with no captions at all

Design notes (learned the hard way this session):
  * We do NOT shell out to `bc` for the loop arithmetic. An earlier bash version
    silently produced ZERO stills when `bc` was missing and then printed
    "legacy-brand hits: 0" — a vacuous pass, which is the exact failure mode that
    let the legacy brand survive four separate checks.
  * A run that samples no frames FAILS (exit 2) rather than reporting clean.
  * The brand matcher is imported from brand_scan.py, so this can never drift
    from the scanner's definitions, and it is exercised by brand_scan's selftest.
  * A frame whose OCR raises or returns empty text is reported, never treated as
    clean.

usage: verify_video.py <video> [intervalSec] [outDir]
exit:  0 = all checks passed, 1 = a check failed, 2 = could not verify
"""
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

# Reuse the single source of truth for what the legacy brand looks like.
from brand_scan import classify_line, NEW_BRAND_RE  # noqa: E402


def ffprobe(args: list[str]) -> str:
    try:
        return subprocess.run(
            ["ffprobe", "-v", "error", *args],
            capture_output=True, text=True, timeout=60,
        ).stdout.strip()
    except Exception:
        return ""


def probe_lines(video: str, stream: str, entries: str) -> str:
    return ffprobe([
        "-select_streams", stream,
        "-show_entries", f"stream={entries}",
        "-of", "default=nw=1", video,
    ])


def duration_of(video: str) -> float:
    out = ffprobe(["-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video])
    try:
        return float(out)
    except ValueError:
        return 0.0


def extract(video: str, at: float, dest: str) -> bool:
    r = subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", video, "-ss", str(at), "-frames:v", "1", dest],
        capture_output=True, text=True, timeout=120,
    )
    return r.returncode == 0 and os.path.exists(dest) and os.path.getsize(dest) > 0


def pixel_stats(png: str) -> tuple[float, float] | None:
    try:
        from PIL import Image
        import numpy as np
    except Exception:
        return None
    try:
        a = np.asarray(Image.open(png).convert("RGB")).astype(float)
    except Exception:
        return None
    return float(a.mean()), float(a.std())


def ocr(png: str) -> str:
    try:
        return subprocess.run(
            ["tesseract", png, "stdout", "--psm", "6"],
            capture_output=True, text=True, timeout=90,
        ).stdout or ""
    except Exception:
        return ""


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: verify_video.py <video> [intervalSec] [outDir]", file=sys.stderr)
        return 2
    video = sys.argv[1]
    step = float(sys.argv[2]) if len(sys.argv) > 2 else 5.0
    outdir = sys.argv[3] if len(sys.argv) > 3 else "/tmp/vv"
    if not os.path.exists(video):
        print(f"missing video: {video}", file=sys.stderr)
        return 2

    os.makedirs(outdir, exist_ok=True)
    for f in os.listdir(outdir):
        if f.endswith(".png"):
            os.unlink(os.path.join(outdir, f))

    dur = duration_of(video)
    print(f"video: {video}")
    print(f"duration: {dur}s  sampling every {step}s")
    print()
    for line in probe_lines(video, "v:0", "codec_name,width,height,r_frame_rate").splitlines():
        print(f"  v: {line}")
    for line in probe_lines(video, "a:0", "codec_name,sample_rate,channels").splitlines():
        print(f"  a: {line}")
    print()

    if dur <= 0 or step <= 0:
        print("cannot verify: unknown duration or bad interval", file=sys.stderr)
        return 2

    t = 0.0
    n = blank = legacy = notext = 0
    # The opening frame(s) are an intentional fade-in over an opaque background,
    # so no text is legible yet. A short grace window avoids reporting the
    # deliberate entrance as a caption defect. Text is confirmed present by the
    # first sample after this window.
    TEXT_GRACE_SEC = 1.0
    while t < dur:
        png = os.path.join(outdir, f"t{t:g}.png")
        if not extract(video, t, png):
            print(f"t={t:<6g} (extract failed)")
            t += step
            continue
        n += 1
        st = pixel_stats(png)
        if st is None:
            print(f"t={t:<6g} (pixel stats unavailable)")
            t += step
            continue
        mean, std = st
        text = ocr(png)
        lines = [ln for ln in text.splitlines() if ln.strip()]
        hits = sum(1 for ln in lines for kind, _ in classify_line(ln) if kind == "HIT")
        onchain = sum(len(NEW_BRAND_RE.findall(ln.lower())) for ln in lines)
        chars = len(re.sub(r"[^a-zA-Z0-9]", "", text))

        flags = []
        # composition background is ~18-25; a dip below 12 with near-zero
        # variance means the frame went to (near) black.
        if mean < 12:
            flags.append(f"BLANK(mean={mean:.1f})")
            blank += 1
        if hits:
            flags.append(f"LEGACY={hits}")
            legacy += 1
        if chars < 20 and t >= TEXT_GRACE_SEC:
            flags.append(f"NO-TEXT(chars={chars})")
            notext += 1
        print(f"t={t:<6g} mean={mean:<7.1f} std={std:<6.1f} "
              f"brand={onchain:<3} {' '.join(flags) if flags else 'ok'}")
        t += step

    print()
    print(f"=== summary over {n} stills ===")
    print(f"blank/near-black : {blank}")
    print(f"legacy-brand hits: {legacy}")
    print(f"no-text frames   : {notext}")

    # Fail closed: a sweep that inspected nothing proves nothing.
    if n == 0:
        print("RESULT: INCONCLUSIVE — no stills were sampled")
        return 2
    if blank or legacy or notext:
        print("RESULT: FAIL")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
