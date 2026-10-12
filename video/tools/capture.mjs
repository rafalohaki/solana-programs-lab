import { chromium } from '@playwright/test';
import fs from 'node:fs';
const exe = '/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const OUT = process.env.OUT_DIR || '/root/hackathon/solana-programs-lab/video/public/live-v2';
const BASE = process.env.BASE_URL || 'https://solhack.rafal.si';
const FPS = 30;
fs.mkdirSync(OUT, { recursive: true });

const easeIO = t => t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;

// Optional clip filter: CLIPS=plans,proofs captures only those, so a single
// dirty page does not force re-capturing every clean clip.
const want = name => !process.env.CLIPS || process.env.CLIPS.split(',').map(s=>s.trim()).includes(name);

// Deterministic frame-sequence capture: scroll position is a pure function of
// the frame index, so the encoded motion is perfectly smooth regardless of how
// long each screenshot takes.
async function capture(page, name, n, posFn, opts = {}) {
  if (!want(name)) { console.log(`${name}: skipped (not in CLIPS)`); return; }
  const dir = `${OUT}/${name}`;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    if (opts.before && opts.before[i]) await opts.before[i](page);
    const y = posFn(i, n);
    if (y !== null) await page.evaluate(v => window.scrollTo(0, v), y);
    if (opts.after && opts.after[i]) await opts.after[i](page);
    await page.screenshot({ path: `${dir}/f${String(i).padStart(4,'0')}.jpg`, type: 'jpeg', quality: 92, animations: 'allow' });
  }
  const secs = (n / FPS).toFixed(1);
  console.log(`${name}: ${n}f (${secs}s) in ${((Date.now()-t0)/1000).toFixed(0)}s`);
}

// Scroll smoothly from a to b across the shot.
const glide = (a, b, hold0 = 0.12, hold1 = 0.88) => (i, n) => {
  const t = i / (n - 1);
  if (t < hold0) return a;
  if (t > hold1) return b;
  return a + (b - a) * easeIO((t - hold0) / (hold1 - hold0));
};

const anchorY = (page, re) => page.evaluate((r) => {
  const h = [...document.querySelectorAll('h1,h2,h3')].find(e => new RegExp(r, 'i').test(e.innerText));
  return h ? Math.max(0, h.getBoundingClientRect().top + window.scrollY - 110) : 1400;
}, re);

const b = await chromium.launch({ executablePath: exe, args: ['--disable-dev-shm-usage','--force-color-profile=srgb','--hide-scrollbars','--font-render-hinting=none'] });
const newPage = async () => {
  const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  return { ctx, page: await ctx.newPage() };
};

// ---------- 1. Home: hero -> live plans ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4500);
  const yPlans = await anchorY(page, 'Live plans');
  await capture(page, 'plans', 330, glide(0, yPlans + 430), {
    before: { 150: async p => { const c = p.locator('button:has-text("Subscribe")').first(); if (await c.count()) await c.hover().catch(()=>{}); } },
  });
  await ctx.close();
}

// ---------- 2. Home: proofs + comparison ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  const y = await anchorY(page, 'Proofs, not promises');
  await capture(page, 'proofs', 300, glide(y - 60, y + 700));
  await ctx.close();
}

// ---------- 3. Home: agent control plane ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  const y = await anchorY(page, 'Agent-Control-Plane');
  await capture(page, 'agent', 260, glide(y - 40, y + 620));
  await ctx.close();
}

// ---------- 4. Pay: checkout + attack simulation ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/pay?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4200);
  const y = await anchorY(page, 'Embeddable Checkout');
  await capture(page, 'checkout', 300, glide(0, y + 520), {
    before: {
      60:  async p => { const x = p.locator('button:has-text("2. Phishing attack")').first(); if (await x.count()) await x.click().catch(()=>{}); },
      150: async p => { const x = p.locator('button:has-text("3. API outage")').first(); if (await x.count()) await x.click().catch(()=>{}); },
      235: async p => { const x = p.locator('button:has-text("1. Authorized domain")').first(); if (await x.count()) await x.click().catch(()=>{}); },
    },
  });
  await ctx.close();
}

// ---------- 5. Merchant: form + batch ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/merchant`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4200);
  await capture(page, 'merchant', 330, glide(0, 1150), {
    before: {
      70:  async p => { const f = p.locator('input:visible, textarea:visible').first(); await f.click({timeout:4000}).catch(()=>{}); },
      120: async p => { const f = p.locator('input:visible, textarea:visible'); const c = await f.count(); if (c > 1) await f.nth(1).click({timeout:4000}).catch(()=>{}); },
      175: async p => { const f = p.locator('input:visible, textarea:visible'); const c = await f.count(); if (c > 2) await f.nth(2).click({timeout:4000}).catch(()=>{}); },
    },
  });
  await ctx.close();
}

// ---------- 6. Manage: subscriptions + kill switch ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/manage?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4500);
  await capture(page, 'manage', 270, glide(0, 640));
  await ctx.close();
}

// ---------- 7. Blinks ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/blink`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  const y = await anchorY(page, '3-line integration');
  await capture(page, 'blink', 270, glide(0, y + 420));
  await ctx.close();
}

// ---------- 8. Examples: live checkout widget ----------
{
  const { ctx, page } = await newPage();
  await page.goto(`${BASE}/examples?demo=1`, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(4000);
  await capture(page, 'examples', 270, glide(0, 1150));
  await ctx.close();
}

await b.close();
console.log('done');
