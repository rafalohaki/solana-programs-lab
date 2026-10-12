#!/usr/bin/env python3
"""Definitive legacy-brand scanner for captured video frames.

Why this exists
---------------
The legacy product name has now evaded FOUR different checks in one day:

  1. plain grep          — the name was split across an HTML tag boundary:
                           `Subscriptions<span class="grad-text">.sol</span>`
  2. dot-requiring regex — a variant renders with the dot DROPPED entirely:
                           `subscriptionssol`
  3. source-only checks  — SSR HTML was clean while the browser's client JS
                           injected the legacy name into the DOM
  4. naive normalization — stripping punctuation then substring-matching
                           false-positives on the generic phrase
                           "subscriptions SOLANA" (-> "subscriptionssolana")

So this scanner works on RENDERED PIXELS, not source text, and it classifies
matches instead of just counting them, because the two confusable cases have
opposite meanings:

  HIT   `subscriptionssol`, `subscriptionssoll`, `subscriptions.sol`, `SUBSCRIPTIONSSOL`
        -> the legacy BRAND. Must be fixed.
  OK    `subscriptionssolana` (from "subscriptions SOLANA"/"subscriptions Solana")
        -> the generic English word + chain name. Must NOT be flagged, or we
           chase phantoms and waste deadline time.

Matching is per OCR LINE (never whole-frame) so that a brand token at the end of
one element does not concatenate with the start of the next and manufacture
either a false positive or a false negative.

Usage:
    brand_scan.py <image> [<image> ...]
    brand_scan.py --dir <frameDir> --clip <name> --frames 1,60,150
Exit code 1 if any HIT is found, else 0.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys

# OCR commonly confuses l/1/I in small mono text and 0/O, s/S is handled by
# lowercasing. Normalize only where it cannot create a false brand reading.
OCR_FOLD = str.maketrans({"1": "l", "|": "l", "!": "l"})

# The legacy brand. OCR does NOT reliably give the stem `subscriptions`:
# measured mangles include `swvscriptions.soi` and `swrvcriptions.so` (OCR turns
# `sub` into `sw`/`swr`, and the `so`+`l` tail is confusable with `so`+`i`).
# So anchor on the most stable tail, `ptionsso` (from "subscri*ptions*" + "so"),
# with an optional l/1/i confusion char, rather than requiring the literal stem.
# `[a-z]{0,6}` absorbs stem damage like "subscnptions" (i -> n).
BRAND_RE = re.compile(r"[a-z]{0,6}ptionsso(?P<rest>[l1i][a-z0-9]*)?")
# Generic phrase (not the brand): "subscriptions SOLANA" -> subscriptionssolana,
# i.e. tail char + "ana". Checked as a PREFIX so "subscriptions Solana payroll"
# is not mistaken for the brand either.
GENERIC_SUFFIXES = ("ana",)

NEW_BRAND_RE = re.compile(r"onchainsub")

# Two OCR segmentation modes are unioned. psm 6 (block) can drop a sparse nav
# strip on a dense 1080p frame; psm 11 (sparse text) recovers it. Unioning is
# strictly more sensitive, and neither mode alone is trusted.
OCR_PSMS = ("6", "11")


def ocr(path: str, psms: tuple[str, ...] = OCR_PSMS) -> str:
    """OCR with each segmentation mode and union the resulting lines.

    Returns "__OCR_ERROR__ ..." only if EVERY mode failed, so a single flaky
    mode cannot silently produce an empty (and therefore vacuously "clean")
    read. Lines are deduplicated: the same line found by both modes is one hit.
    """
    lines: list[str] = []
    seen: set[str] = set()
    errors: list[str] = []
    any_ok = False
    for psm in psms:
        try:
            out = subprocess.run(
                ["tesseract", path, "stdout", "--psm", psm],
                capture_output=True, text=True, timeout=90,
            )
        except Exception as exc:  # pragma: no cover - environment failure
            errors.append(str(exc))
            continue
        if out.returncode != 0:
            errors.append(f"psm{psm} rc={out.returncode} {(out.stderr or '').strip()[:60]}")
            continue
        any_ok = True
        for line in (out.stdout or "").splitlines():
            key = " ".join(line.split()).lower()
            if not key or key in seen:
                continue
            seen.add(key)
            lines.append(line)
    if not any_ok:
        return "__OCR_ERROR__ " + "; ".join(errors)
    return "\n".join(lines)


def strip_non_alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def classify_line(line: str) -> list[tuple[str, str]]:
    """Return [(kind, excerpt)] for one OCR line, kind in {HIT, OK}."""
    stripped = strip_non_alnum(line)
    if not stripped:
        return []
    results: list[tuple[str, str]] = []
    for m in BRAND_RE.finditer(stripped):
        rest = m.group("rest") or ""
        # `rest` is the confusion char (l/1/i) plus anything after it.
        kind = "OK" if rest[1:].startswith(GENERIC_SUFFIXES) else "HIT"
        lo = max(0, m.start() - 14)
        hi = min(len(stripped), m.end() + 14)
        results.append((kind, f"...{stripped[lo:hi]}..."))
    return results


# Positive-direction self-test. Every matcher that failed us today failed
# SILENTLY — it printed "clean" while the brand was on screen. So this asserts
# that the detector actually catches each real rendering (including the OCR
# mangles measured on real frames) while still rejecting the generic phrase and
# legitimate UI strings. Run: brand_scan.py --selftest
SELF_TEST_CASES: list[tuple[str, str]] = [
    # real renderings and OCR mangles of the legacy brand -> must HIT
    ("Subscriptions.sol", "HIT"),
    ("subscriptions.sol", "HIT"),
    ("subscriptionssol", "HIT"),
    ("SUBSCRIPTIONSSOL", "HIT"),
    ("subscriptionssoll", "HIT"),
    ("SubscriptionS.sol", "HIT"),
    ("swvscriptions.soi", "HIT"),   # measured OCR mangle
    ("swrvcriptions.so", "HIT"),    # measured OCR mangle
    ("Subscnptions.sol", "HIT"),    # damaged glyphs mid-word
    # generic phrase -> must NOT be reported as the brand
    ("subscriptions SOLANA", "OK"),
    ("subscriptions Solana payroll", "OK"),
    # legitimate UI strings -> must not match at all
    ("My subscriptions", "none"),
    ("subscriptions that live", "none"),
    ("Plans Merchant My subscriptions Blinks Examples Explorer", "none"),
    ("OnchainSUB Plans Merchant Blinks", "none"),
    ("onchainsub", "none"),
]


def self_test() -> int:
    failures = 0
    for line, want in SELF_TEST_CASES:
        got = [k for k, _ in classify_line(line)] or ["none"]
        ok = want in got
        if not ok:
            failures += 1
        print(f"  [{'OK' if ok else 'FAIL'}] {line!r:45} want={want:5} got={got}")
    total = len(SELF_TEST_CASES)
    print()
    print(f"self-test: {total - failures}/{total} passed")
    return 1 if failures else 0


def extract_frame(video: str, at_sec: float, dest: str) -> bool:
    """Extract one frame from a video to `dest`. Returns True on success."""
    try:
        r = subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", video, "-ss", f"{at_sec}",
             "-frames:v", "1", dest],
            capture_output=True, text=True, timeout=120,
        )
    except Exception:
        return False
    return r.returncode == 0 and os.path.exists(dest)


def scan_image(path: str) -> tuple[int, int, list[str]]:
    """Return (hits, onchain_mentions, detail_lines).

    An OCR failure returns hits=1 (fail-closed): a frame we could not read must
    never be reported as clean, because a vacuous pass is exactly how the legacy
    brand survived four separate checks today.
    """
    text = ocr(path)
    if text.startswith("__OCR_ERROR__"):
        return 1, 0, ["UNREADABLE(fail-closed): " + text]
    hits = 0
    onchain = 0
    details: list[str] = []
    for line in text.splitlines():
        if not line.strip():
            continue
        onchain += len(NEW_BRAND_RE.findall(line.lower()))
        for kind, excerpt in classify_line(line):
            if kind == "HIT":
                hits += 1
            details.append(f"{kind}: {excerpt}")
    return hits, onchain, details


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="*")
    ap.add_argument("--dir", help="frame directory, e.g. video/public/live-v2/blink")
    ap.add_argument("--clip", default="clip", help="label for --dir mode")
    ap.add_argument("--frames", default="1", help="comma-separated frame indices for --dir mode")
    ap.add_argument("--selftest", action="store_true", help="verify the detector, then exit")
    args = ap.parse_args()

    # Always prove the detector can see the brand before trusting a CLEAN verdict.
    if args.selftest:
        print("brand_scan self-test (detector correctness):")
        return self_test()

    targets: list[tuple[str, str]] = []
    total_hits = 0
    if args.dir:
        for fr in args.frames.split(","):
            fr = fr.strip()
            if not fr:
                continue
            targets.append((f"{args.clip}#{fr}", os.path.join(args.dir, f"f{int(fr):04d}.jpg")))
    for img in args.images:
        # Video inputs are sampled at --frames as SECONDS; stills are used directly.
        if img.lower().endswith((".mp4", ".mov", ".webm", ".mkv")):
            for sec in args.frames.split(","):
                sec = sec.strip()
                if not sec:
                    continue
                dest = f"/tmp/_brandscan_{os.path.basename(img)}_{sec}.png"
                if extract_frame(img, float(sec), dest):
                    targets.append((f"{os.path.basename(img)}@{sec}s", dest))
                else:
                    print(f"{os.path.basename(img)}@{sec}s   FRAME-EXTRACT-FAILED")
                    total_hits += 1
        else:
            targets.append((os.path.basename(img), img))

    if not targets:
        ap.error("no images given")

    total_onchain = 0
    for label, path in targets:
        if not os.path.exists(path):
            print(f"{label:<22} MISSING {path}")
            total_hits += 1
            continue
        hits, onchain, details = scan_image(path)
        total_hits += hits
        total_onchain += onchain
        flag = "HIT" if hits else "ok"
        print(f"{label:<22} {flag:<4} legacy={hits} onchain_mentions={onchain}")
        for d in details[:6]:
            print(f"    {d}")

    print()
    print(f"TOTAL legacy hits: {total_hits}   new-brand mentions: {total_onchain}")
    if total_hits:
        print("RESULT: DIRTY — legacy brand is visible in pixels")
        return 1
    print("RESULT: CLEAN — no legacy brand in pixels")
    return 0


if __name__ == "__main__":
    sys.exit(main())
