// Markup-and-punctuation-aware brand assertion. A plain string or regex grep is
// structurally blind to all three obfuscations we have observed in this repo:
//   1. split by a tag:                Subscriptions<span>.sol</span>
//   2. split across whitespace:       Subscriptions
//                                     .sol
//   3. punctuation dropped entirely:  subscriptionssol
//
// The instrument: take RENDERED text, lowercase it, strip EVERY non-alphanumeric
// character, then look for the bare dotless token with a trailing guard that
// rejects a longer word (so "subscriptions SOLANA" -> `subscriptionssolana` is
// correctly NOT a match).
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
// TWO FORBIDDEN BRANDS, ONE POSITIVE ASSERTION (rename OnchainSUB -> Iugis):
// this gate now knows BOTH retired names, because after a rename the previous
// brand becomes just as much of a defect as the original one:
//   - `subscriptionssol` — legacy Subscriptions.sol wordmark
//   - `onchainsub`        — retired OnchainSUB wordmark (display AND lowercase)
// A gate that only knew the first would pass a page still reading
// "Onchain<span>SUB</span>", i.e. exactly the failure mode introduced by a
// rename. Note the split form `Onchain<span class="grad-text">SUB</span>` is
// invisible to a naive `grep OnchainSUB` — it is neither contiguous nor
// dotless `onchainsub` — which is precisely why the check must be per-element
// on NORMALISED text. It must also assert the NEW name is actually present in
// the header: absence of the old brand is not evidence the new one ships.
//
// Run from e2e/:  node brand-render-check.mjs
// Exits non-zero on any dirty page, so it can gate footage capture.
import { chromium } from "/root/hackathon/solana-programs-lab/e2e/node_modules/playwright/index.mjs";

const EXECUTABLE = "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome";
const ORIGIN = process.env.ORIGIN ?? "https://solhack.rafal.si";
const PATHS = ["/", "/merchant", "/pay?demo=1", "/blink", "/examples?demo=1", "/legal", "/manage?demo=1"];

// Every retired/forbidden brand, in normalised (dotless, lowercase) form.
const FORBIDDEN = [
  { key: "legacy", needle: "subscriptionssol" },
  { key: "prevbrand", needle: "onchainsub" },
];
const NEEDLES = FORBIDDEN.map((f) => f.needle);

// The current brand. Normalised, so the gradient-split markup
// (`Iu<span class="grad-text">gis</span>`) still yields `iugis` in the header.
const CURRENT = "iugis";

// The single scan implementation, executed inside the page. Takes an array of
// needles and reports which one each offending element matched, so a failure
// names the brand. Returned as a function so controls and live pages cannot
// drift apart.
const SCAN = (needles) => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const guards = needles.map((n) => [n, new RegExp(`${n}(?![a-z])`)]);
  const all = [];
  // Include document.body itself: a name split across two SIBLING elements
  // (variant 2) has no matching ancestor other than body, and querySelectorAll
  // ("body *") excludes body. Descendants are still preferred (see filter below).
  for (const el of [document.body, ...document.querySelectorAll("body *")]) {
    const txt = (el.textContent ?? "").trim();
    if (!txt) continue;
    const n = norm(txt);
    const hit = guards.find(([, g]) => g.test(n));
    if (hit) {
      all.push({
        el,
        needle: hit[0],
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
  return minimal.map(({ needle, tag, cls, txt, visible }) => ({ needle, tag, cls, txt, visible }));
};

// ---- NEGATIVE CONTROLS: executed in-browser via the same scan --------------
// Must MATCH (want 1) — every obfuscation of BOTH retired brands.
const CONTROLS = [
  { name: "legacy v1: split by a tag", needle: "subscriptionssol", want: 1, html: '<span class="truncate">Subscriptions<span class="grad-text">.sol</span></span>' },
  { name: "legacy v2: split across whitespace", needle: "subscriptionssol", want: 1, html: '<span class="a">Subscriptions</span>\n<span class="b">.sol</span>' },
  { name: "legacy v3: punctuation dropped", needle: "subscriptionssol", want: 1, html: '<span class="uppercase">subscriptionssol</span>' },
  { name: "legacy v3 abutting next word", needle: "subscriptionssol", want: 1, html: '<span class="uppercase">subscriptionssol</span><span>Recurring</span>' },
  // The /blink structure verbatim: badge next to a trailing word.
  { name: "legacy v3 abutting (multi-line)", needle: "subscriptionssol", want: 1, html: '<div><p>Blinks</p><span>subscriptionssol</span><p>Recurring invoices</p></div>' },
  // The NEW failure mode: the retired OnchainSUB brand, in every form.
  { name: "prevbrand plain display", needle: "onchainsub", want: 1, html: '<span class="font-display">OnchainSUB</span>' },
  { name: "prevbrand split by a tag", needle: "onchainsub", want: 1, html: '<span class="truncate">Onchain<span class="grad-text">SUB</span></span>' },
  { name: "prevbrand lowercase (grammar/blink badge)", needle: "onchainsub", want: 1, html: '<span class="uppercase">onchainsub</span>' },
  { name: "prevbrand abutting next word", needle: "onchainsub", want: 1, html: '<span>OnchainSUB</span><span>Demo</span>' },
  { name: "prevbrand in a title attribute value", needle: "onchainsub", want: 1, html: '<title>Blink — OnchainSUB</title><body><p>x</p></body>' },
];
// Must NOT match (want 0) — a longer word beginning with a needle, innocent
// copy, and critically the NEW brand (which must not trip either needle).
const NEGATIVES = [
  { name: "longer word (subscriptions SOLANA)", needle: "subscriptionssol", want: 0, html: '<span>Subscriptions SOLANA</span>' },
  { name: "hero headline (Subscriptions that live)", needle: "subscriptionssol", want: 0, html: '<span>Subscriptions that live</span>' },
  { name: "function name fetchSubscriptionsOf", needle: "subscriptionssol", want: 0, html: '<code>fetchSubscriptionsOf</code>' },
  { name: "new brand Iugis", needle: "onchainsub", want: 0, html: '<span class="truncate">Iu<span class="grad-text">gis</span></span>' },
  { name: "new brand in a sentence", needle: "onchainsub", want: 0, html: '<span>Iugis — on-chain subscriptions on Solana</span>' },
  { name: "generic noun subscriptions", needle: "onchainsub", want: 0, html: '<span>My subscriptions</span>' },
];

const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let controlFailures = 0;
console.log("=== CONTROLS (detector self-test, run in-browser through the same SCAN) ===");
await page.goto("about:blank");
for (const c of [...CONTROLS, ...NEGATIVES]) {
  await page.setContent(`<!doctype html><html><body>${c.html}</body></html>`);
  const hits = await page.evaluate(SCAN, NEEDLES);
  const matched = hits.filter((h) => h.needle === c.needle).length;
  const ok = matched === c.want;
  if (!ok) controlFailures++;
  console.log(`  [${ok ? "OK " : "BAD"}] ${c.name} -> hits ${matched} (want ${c.want})`);
}
console.log(`  (raw grep -c "subscriptions\\.sol" on legacy v3 -> 0; that is the blindness)`);
console.log(`  (raw grep -c "OnchainSUB" on prevbrand split-tag -> 0; same blindness, new brand)`);
console.log(`  CONTROLS: ${controlFailures === 0 ? "PASS" : `FAIL (${controlFailures})`}`);

// ---- LIVE ASSERTION over rendered text, per element -------------------------
let dirty = 0;
let headerMissing = 0;
const details = {};
console.log(`\norigin=${ORIGIN}`);
console.log("path                 forbidden  legacy  prevbrand  brandHits  headerHasIugis  headerText");
console.log("-".repeat(110));

for (const p of PATHS) {
  await page.goto(ORIGIN + p, { waitUntil: "load" });
  await page.waitForTimeout(4000); // let client JS run

  const hits = await page.evaluate(SCAN, NEEDLES);
  const meta = await page.evaluate(() => ({
    bodyText: document.body.innerText,
    headerText: document.querySelector("header")?.innerText ?? "",
  }));

  const legacyHits = hits.filter((h) => h.needle === "subscriptionssol").length;
  const prevHits = hits.filter((h) => h.needle === "onchainsub").length;
  const rawHits = (meta.bodyText.match(/subscriptions[.\-]sol/gi) ?? []).length;

  // Positive assertion on the NEW brand, normalised so the gradient split
  // (`Iu` + `gis`) still counts. Absence of the old brand is not proof the new
  // one ships.
  const headerNorm = meta.headerText.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const hasIugis = headerNorm.includes(CURRENT);
  if (!hasIugis) headerMissing++;

  if (hits.length !== 0) { dirty++; details[p] = hits; }
  console.log(
    `${p.padEnd(20)} ${String(hits.length).padEnd(10)} ${String(legacyHits).padEnd(7)} ${String(prevHits).padEnd(10)} ${String(rawHits).padEnd(10)} ${String(hasIugis).padEnd(15)} ${JSON.stringify(meta.headerText.split("\n")[0] ?? "")}`,
  );
}

if (dirty > 0) {
  console.log("\nDIRTY ELEMENTS (these are what a judge sees):");
  for (const [p, hits] of Object.entries(details)) {
    for (const h of hits) {
      console.log(`  ${p}  [${h.needle}] <${h.tag} class="${h.cls}"> visible=${h.visible}  txt=${JSON.stringify(h.txt)}`);
    }
  }
}
if (headerMissing > 0) {
  console.log(`\nHEADER MISSING "${CURRENT}" on ${headerMissing} page(s) — the new brand is not shipping.`);
}

await browser.close();
const pass = dirty === 0 && controlFailures === 0 && headerMissing === 0;
console.log(`\nDEFINITIVE: ${dirty} page(s) DIRTY | ${headerMissing} page(s) WITHOUT "${CURRENT}" header | controls ${controlFailures === 0 ? "PASS" : "FAIL"}`);
console.log(`RESULT: ${pass ? "PASS — 0 forbidden-brand matches on all 7 pages (both brands, all obfuscations) and \"Iugis\" present in every header" : "FAIL"}`);
process.exit(pass ? 0 : 1);
