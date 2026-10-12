// Verify the two submission video URLs actually PLAY inside a <video> element.
// Direct navigation to a release asset downloads rather than streaming, so the
// only meaningful question is whether an embedded <video src=...> reaches
// readyState 4 and advances currentTime. Measured, not assumed.
import { chromium } from "@playwright/test";

const URLS = [
  ["pitch", "https://github.com/rafalohaki/solana-programs-lab/releases/download/submission-v1/onchain-sub-pitch.mp4"],
  ["demo", "https://github.com/rafalohaki/solana-programs-lab/releases/download/submission-v1/onchain-sub-demo.mp4"],
];

const browser = await chromium.launch({
  executablePath: "/root/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome",
  args: ["--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
});

let failed = 0;
for (const [name, url] of URLS) {
  const page = await browser.newPage();
  const reqs = [];
  page.on("response", (r) => { if (r.url().includes("onchain-sub")) reqs.push(`${r.status()} ${r.headers()["content-type"] || "?"} ranges=${r.headers()["accept-ranges"] || "-"}`); });
  await page.setContent(`<!doctype html><body style="margin:0;background:#000">
    <video id="v" src="${url}" muted playsinline width="640"></video>
    <script>window.__err=null;document.getElementById('v').addEventListener('error',()=>{window.__err='video error';});</script>
  </body>`);
  // Load metadata without playing first.
  const meta = await page.evaluate(() => new Promise((res) => {
    const v = document.getElementById("v");
    const done = () => res({ rs: v.readyState, dur: v.duration, w: v.videoWidth, h: v.videoHeight, err: window.__err });
    if (v.readyState >= 1) return done();
    v.addEventListener("loadedmetadata", done, { once: true });
    setTimeout(done, 20000);
  }));
  // Then confirm it decodes and advances.
  const played = await page.evaluate(() => new Promise((res) => {
    const v = document.getElementById("v");
    v.currentTime = 0;
    v.play().then(() => {
      setTimeout(() => res({ t: v.currentTime, rs: v.readyState, err: window.__err }), 4000);
    }).catch((e) => res({ t: -1, rs: v.readyState, err: String(e) }));
  }));
  const ok = meta.rs === 4 && played.t > 1 && meta.w > 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: readyState=${meta.rs} dur=${meta.dur?.toFixed?.(2)} ${meta.w}x${meta.h} playedTo=${played.t?.toFixed?.(2)} err=${played.err ?? meta.err ?? "none"}`);
  for (const r of reqs.slice(0, 3)) console.log(`      net: ${r}`);
  await page.close();
}
await browser.close();
console.log(failed ? `\nRESULT: FAIL (${failed})` : "\nRESULT: PASS — both URLs play inline in <video>");
process.exit(failed ? 1 : 0);
