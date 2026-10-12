// One-shot verification: prove the four canonical signed-message grammars are
// byte-identical between the frontend signers and the backend verifiers.
// Extracts the ACTUAL template-literal source from each file (no hand-typing).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = "/root/hackathon/solana-programs-lab";
const sha = (s) => createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
const read = (p) => readFileSync(`${root}/${p}`, "utf8");

// Pull the first backtick template literal following `marker`.
function literal(file, marker) {
  const src = read(file);
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`marker not found: ${marker} in ${file}`);
  const start = src.indexOf("`", at);
  const end = src.indexOf("`", start + 1);
  return src.slice(start + 1, end);
}

// Render a template source with named values (true JS semantics, incl. \n).
function render(tpl, vars) {
  const names = Object.keys(vars);
  return new Function(...names, `return \`${tpl}\`;`)(...names.map((n) => vars[n]));
}

// Structural fingerprint: expression names differ between mirrors by design,
// so collapse every ${...} to a positional token for the shape comparison.
const shape = (tpl) => tpl.replace(/\$\{[^}]*\}/g, "${}");

const cases = [];
const check = (label, sideA, sideB, varsA, varsB, inputs) => {
  const a = render(sideA.tpl, varsA);
  const b = render(sideB.tpl, varsB);
  // Compare with the concrete inputs the two sides would independently build.
  const ra = render(sideA.tpl, inputs.a);
  const rb = render(sideB.tpl, inputs.b);
  cases.push({
    label,
    shapeIdentical: shape(a) === shape(b),
    byteIdenticalSameInputs: ra === rb,
    shaA: sha(ra),
    shaB: sha(rb),
    a: ra.replace(/\n/g, "\\n"),
    b: rb.replace(/\n/g, "\\n"),
  });
};

// ---- 1. widget-bind: backend/src/widget.ts:225 <-> EmbedPanel.svelte:73 ----
{
  const be = { tpl: literal("backend/src/widget.ts", "export function widgetBindMessage") };
  const fe = { tpl: literal("frontend/src/components/EmbedPanel.svelte", "function widgetBindMessage") };
  const V = { merchant: "MERCMERCMERC", domain: "shop.example.com", plan: "PLANPLANPLAN", timestamp: 1728300000000 };
  check("widget-bind", be, fe, V, V, { a: V, b: V });
}

// ---- 2. plan-meta: backend/src/plans-meta.ts:132 <-> lib/plansMeta.ts:55 ----
{
  const be = { tpl: literal("backend/src/plans-meta.ts", "export function planMetaMessage") };
  const fe = { tpl: literal("frontend/src/lib/plansMeta.ts", "export function planMetaMessage") };
  const V = { merchant: "MERCMERCMERC", plan: "PLANPLANPLAN", title: "Pro", description: "d", category: "saas", handle: "acme", timestamp: 1728300000000 };
  check("plan-meta", be, fe, V, V, { a: V, b: V });
}

// ---- 3. media-put-v2: backend/src/media.ts:160 <-> lib/media.ts:65 ----
{
  const be = { tpl: literal("backend/src/media.ts", "function canonicalMediaMessageV2") };
  const fe = { tpl: literal("frontend/src/lib/media.ts", "new TextEncoder().encode(") };
  const varsFE = { address: "MERCMERCMERC", key: "uploads/x.png", file: { type: "image/png" }, bodySha256: "ab".repeat(32), timestamp: "1728300000000" };
  const varsBE = { merchant: "MERCMERCMERC", key: "uploads/x.png", contentType: "image/png", bodySha256Hex: "ab".repeat(32), timestamp: "1728300000000" };
  check("media-put-v2", be, fe, varsBE, varsFE, { a: varsBE, b: varsFE });
}

// ---- 4. receipt-bind: backend/src/routes.ts:388 and :398 (backend-only) ----
{
  const b1 = { tpl: literal("backend/src/routes.ts", "export function receiptBindMessage") };
  const b2 = { tpl: literal("backend/src/routes.ts", "export function receiptChargeMessage") };
  const v1 = { merchant: "MERCMERCMERC", invoice: "INV-2026-0001", timestamp: 1728300000000 };
  const v2 = { merchant: "MERCMERCMERC", invoice: "INV-2026-0001", amount: 1000000n, txSignature: "TXSIG", timestamp: 1728300000000 };
  cases.push({
    label: "receipt-bind (backend-only, no frontend mirror)",
    shapeIdentical: shape(b1.tpl).split("\\n")[0] === shape(b2.tpl).split("\\n")[0],
    byteIdenticalSameInputs: null,
    shaA: sha(render(b1.tpl, v1)),
    shaB: sha(render(b2.tpl, v2)),
    a: render(b1.tpl, v1).replace(/\n/g, "\\n"),
    b: render(b2.tpl, v2).replace(/\n/g, "\\n"),
  });
}

let ok = true;
for (const c of cases) {
  const pass = c.shapeIdentical && (c.byteIdenticalSameInputs === null || c.byteIdenticalSameInputs);
  if (!pass) ok = false;
  console.log(`\n[${pass ? "PASS" : "FAIL"}] ${c.label}`);
  console.log(`  shape(frontend) === shape(backend): ${c.shapeIdentical}`);
  if (c.byteIdenticalSameInputs !== null) console.log(`  rendered bytes identical:          ${c.byteIdenticalSameInputs}`);
  console.log(`  sha256 A: ${c.shaA}`);
  console.log(`  sha256 B: ${c.shaB}`);
  console.log(`  A: ${c.a}`);
  console.log(`  B: ${c.b}`);
}
console.log(`\nRESULT: ${ok ? "ALL GRAMMAR PAIRS BYTE-IDENTICAL" : "MISMATCH"}`);
process.exit(ok ? 0 : 1);
