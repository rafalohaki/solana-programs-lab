// Markup-and-punctuation-aware brand assertion. A plain string or regex grep is
// structurally blind to all three obfuscations we have observed in this repo:
//   1. split by a tag:                Subscriptions<span>.sol</span>
//   2. split across whitespace:       Subscriptions
//                                     .sol
//   3. punctuation dropped entirely:  subscriptionssol
//
// The instrument: take RENDERED text, lowercase it, strip EVERY non-alphanumeric
// character, then look for the bare dotless token `subscriptionssol` with a
// trailing guard that rejects a longer word (so "subscriptions SOLANA" ->
// `subscriptionssolana` is correctly NOT a match).
//
// WHY PER ELEMENT, NOT WHOLE-BODY: a trailing guard over concatenated page text
// yields FALSE NEGATIVES. On /blink the badge literally abuts the next line
// ("subscriptionssol" + "Recurring"), so whole-body normalisation produces
// "...subscriptionssolrecurring..." and the guard suppresses the real hit. Each
// element's OWN normalised text keeps the guard meaningful: the badge element is
// exactly "subscriptionssol", so it is caught, while "Subscriptions SOLANA" and
// "Subscriptions that live" still correctly do not match.
//
// The negative controls below are executed IN THE SAME BROWSER THROUGH THE SAME
// SCAN FUNCTION as the live pages. They are not simulated: an earlier version of
// this file simulated them by concatenating sibling HTML, which reproduced the
// very false-negative the real scan avoids and produced a bogus control FAIL.
// Sharing one implementation makes harness/live divergence impossible.
//
// Run from e2e/:  node brand-render-check.mjs
// Exits non-zero on any dirty page, so it can gate footage capture.
import { chromium } from "/root/hackathon/solana-programs-lab/e2e/node_modules/playwright/index.mjs";

const EXECUTABLE = "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const ORIGIN = process.env.ORIGIN ?? "https://solhack.rafal.si";
const PATHS = ["/", "/merchant", "/pay?demo=1", "/blink", "/examples?demo=1", "/legal", "/manage?demo=1"];

const NEEDLE = "subscriptionssol";

// The single scan implementation, executed inside the page. Returned as a
// function so controls and live pages cannot drift apart.
const SCAN = (needle) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const guard = new RegExp(`${needle}(?![a-z])`);
  const all = [];
  // Include document.body itself: a name split across two SIBLING elements
  // (variant 2) has no matching ancestor other than body, and querySelectorAll
  // ("body *") excludes body. Descendants are still preferred (see filter below).
  for (const el of [document.body, ...document.querySelectorAll("body *")]) {
    const txt = (el.textContent ?? "").trim();
    if (!txt) continue;
    if (guard.test(norm(txt))) {
      all.push({
        el,
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 60),
        txt: txt.slice(0, 120),
        visible: !!(el.offsetParent || el.getClientRects().length),
      });
    }
  }
  // Keep only the deepest matches: drop any ancestor that merely contains a
  // matching descendant, so the report names the actual offending element.
  const minimal = all.filter((h) => !all.some((o) => o !== h && h.el.contains(o.el)));
  return minimal.map(({ tag, cls, txt, visible }) => ({ tag, cls, txt, visible }));
};

// ---- NEGATIVE CONTROLS: executed in-browser via the same scan --------------
const CONTROLS = [
  { name: "variant 1: split by a tag", html: '<span class="truncate">Subscriptions<span class="grad-text">.sol</span></span>', want: 1 },
  { name: "variant 2: split across whitespace", html: '<span class="a">Subscriptions</span>\n<span class="b">.sol</span>', want: 1 },
  { name: "variant 3: punctuation dropped", html: '<span class="uppercase">subscriptionssol</span>', want: 1 },
  { name: "variant 3 abutting next word", html: '<span class="uppercase">subscriptionssol</span><span>Recurring</span>', want: 1 },
  // The /blink structure verbatim: badge next to a trailing word.
  { name: "variant 3 abutting (multi-line)", html: '<div><p>Blinks</p><span>subscriptionssol</span><p>Recurring invoices</p></div>', want: 1 },
];
// Must NOT match: a longer word beginning with the needle, or innocent copy.
const NEGATIVES = [
  { name: "longer word (subscriptions SOLANA)", html: '<span>Subscriptions SOLANA</span>', want: 0 },
  { name: "hero headline (Subscriptions that live)", html: '<span>Subscriptions that live</span>', want: 0 },
  { name: "function name fetchSubscriptionsOf", html: '<code>fetchSubscriptionsOf</code>', want: 0 },
];

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let controlFailures = 0;
console.log("=== NEGATIVE CONTROLS (detector self-test, run in-browser) ===");
await page.goto("about:blank");
for (const c of [...CONTROLS, ...NEGATIVES]) {
  await page.setContent(`<!doctype html><html><body>${c.html}</body></html>`);
  const hits = await page.evaluate(SCAN, NEEDLE);
  const ok = hits.length === c.want;
  if (!ok) controlFailures++;
  console.log(`  [${ok ? "OK " : "BAD"}] ${c.name} -> hits ${hits.length} (want ${c.want})`);
}
console.log(`  (raw grep -c "subscriptions\\.sol" on variant 3 -> 0; that is the blindness)`);
console.log(`  CONTROLS: ${controlFailures === 0 ? "PASS" : `FAIL (${controlFailures})`}`);

// ---- LIVE ASSERTION over rendered text, per element -------------------------
let dirty = 0;
const details = {};
console.log(`\norigin=${ORIGIN}`);
console.log("path                 legacy(dotless)  legacy(raw)  brandHits  headerFirstLine");
console.log("-".repeat(88));

for (const p of PATHS) {
  await page.goto(ORIGIN + p, { waitUntil: "load" });
  await page.waitForTimeout(4000); // let client JS run

  const hits = await page.evaluate(SCAN, NEEDLE);
  const meta = await page.evaluate(() => ({
    bodyText: document.body.innerText,
    headerText: document.querySelector("header")?.innerText ?? "",
  }));

  const rawHits = (meta.bodyText.match(/subscriptions[.\-]sol/gi) ?? []).length;
  const brandHits = (meta.bodyText.match(/onchainsub/gi) ?? []).length;

  if (hits.length !== 0) { dirty++; details[p] = hits; }
  console.log(
    `${p.padEnd(20)} ${String(hits.length).padEnd(16)} ${String(rawHits).padEnd(12)} ${String(brandHits).padEnd(10)} ${JSON.stringify(meta.headerText.split("\n")[0] ?? "")}`,
  );
}

if (dirty > 0) {
  console.log("\nDIRTY ELEMENTS (these are what a judge sees):");
  for (const [p, hits] of Object.entries(details)) {
    for (const h of hits) {
      console.log(`  ${p}  <${h.tag} class="${h.cls}"> visible=${h.visible}  txt=${JSON.stringify(h.txt)}`);
    }
  }
}

await browser.close();
const pass = dirty === 0 && controlFailures === 0;
console.log(`\nDEFINITIVE: ${dirty} page(s) DIRTY | controls ${controlFailures === 0 ? "PASS" : "FAIL"}`);
console.log(`RESULT: ${pass ? "PASS — 0 legacy matches on all 7 pages, all 3 obfuscations covered" : "FAIL"}`);
process.exit(pass ? 0 : 1);
