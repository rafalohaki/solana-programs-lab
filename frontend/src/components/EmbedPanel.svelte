<script lang="ts">
  import bs58 from "bs58";
  import { signMessage, wallet } from "../lib/wallet.js";
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-merch2.js";
  import "../lib/i18n-port2.js";
  import { isDemoMode } from "../lib/demo.js";
  interface PlanOption {
    address: string;
    label: string;
  }

  interface SiteEntry {
    domain: string;
    plan: string;
    createdAt: string | null;
  }

  let { plans = [] }: { plans: PlanOption[] } = $props();

  const merchant = $derived($wallet.address?.toBase58() ?? "");

  let domain = $state("");
  let selectedPlan = $state(plans[0]?.address ?? "");
  let sites: SiteEntry[] = $state([]);
  let loading = $state(false);
  let saving = $state(false);
  let error: string | null = $state(null);
  /** i18n key of the human-readable label; `error` carries the technical detail. */
  let errorKey: string | null = $state(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let saved = $state(false);
  let savedInfo: { plan: string; merchant: string; signature: string | null } | null = $state(null);
  let copied = $state(false);

  // Snippet rendered as tinted segments; copy() joins exactly these texts,
  // so what you see is byte-identical to what lands on the clipboard.
  // Svelte escapes each {seg.text} expression, so the angle brackets are
  // safe to keep as plain strings.
  const snippetSegs = $derived([
    { cls: "es-tag", text: `<script src=` },
    { cls: "es-str", text: `"https://solhack.rafal.si/widget.js"` },
    { cls: "es-tag", text: `><\/script>\n<button onclick="` },
    { cls: "es-api", text: `SolhackPay.subscribe` },
    { cls: "", text: `({ plan: '` },
    { cls: "es-str", text: `${selectedPlan}` },
    { cls: "", text: `' })\n  .then((sig) => console.log(` },
    { cls: "es-str", text: `'paid'` },
    { cls: "", text: `, sig))">` },
    { cls: "", text: `Subscribe` },
    { cls: "es-tag", text: `</button>` },
  ]);
  const snippet = $derived(snippetSegs.map((s) => s.text).join(""));

  // --- Widget-bind signing (mirrors backend/src/widget.ts) ------------------
  // Byte-for-byte mirrors of the backend helpers: the merchant must sign the
  // canonical message carrying the NORMALIZED domain, so FE normalization has
  // to stay identical to normalizeHost() server-side. If one side changes,
  // change both (verified by the backend/README.md contract).

  /** Mirror of backend normalizeHost — lowercase, strip port + trailing dot. */
  function normalizeHost(value: string): string {
    let host = value.trim().toLowerCase();
    if (host.startsWith("[") && host.includes("]")) host = host.slice(1, host.indexOf("]"));
    else if (host.includes(":") && /:[0-9]+$/.test(host)) host = host.slice(0, host.lastIndexOf(":"));
    if (host.endsWith(".")) host = host.slice(0, -1);
    return host;
  }

  /** Mirror of backend widgetBindMessage — the exact string the server verifies. */
  function widgetBindMessage(merchant: string, domain: string, plan: string, timestamp: number): string {
    return `onchainsub widget-bind\nmerchant:${merchant}\ndomain:${domain}\nplan:${plan}\nts:${timestamp}`;
  }

  // Live preview of the canonical bind message built from REAL inputs
  // (merchant, normalized domain, plan). No fake signature — the wallet
  // signs a fresh timestamp at save time; until then this is unsigned text.
  const bindMessagePreview = $derived(
    merchant === "" || selectedPlan === "" || domain.trim() === ""
      ? null
      : widgetBindMessage(merchant, normalizeHost(domain.trim()), selectedPlan, Date.now()),
  );

  // Monotonic sequence: a newer load() (merchant change) invalidates any
  // in-flight older one, so a slow response can never publish another
  // account's sites or re-point selectedPlan.
  let loadSeq = 0;

  async function load(): Promise<void> {
    const seq = ++loadSeq;
    // Synchronous read before the first await — this is what the merchant
    // $effect tracks, and the snapshot the guards below compare against.
    const m = merchant;
    if (m === "") return;
    if (isDemoMode()) {
      // Demo mode: no site fixtures exist — show the honest empty state, no fetch.
      sites = [];
      loading = false;
      return;
    }
    loading = true;
    error = null;
    errorKey = null;
    try {
      const res = await fetch(`/api/widget/sites?merchant=${encodeURIComponent(m)}`);
      const json = (await res.json()) as { sites?: SiteEntry[]; error?: string };
      if (seq !== loadSeq) return;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      sites = json.sites ?? [];
      if (selectedPlan === "" && plans[0] !== undefined) selectedPlan = plans[0].address;
    } catch (err) {
      if (seq !== loadSeq) return;
      errorKey = "embed.loadFail";
      error = err instanceof Error ? err.message : null;
    } finally {
      // A superseded run must not clear the flag of a newer in-flight one.
      if (seq === loadSeq) loading = false;
    }
  }

  async function save(e: SubmitEvent): Promise<void> {
    e.preventDefault();
    if (merchant === "" || domain.trim() === "" || selectedPlan === "") return;
    saving = true;
    error = null;
    errorKey = null;
    saved = false;
    savedInfo = null;
    try {
      let sig: string | null = null;
      let body: Record<string, unknown> = { merchant, domain: domain.trim(), plan: selectedPlan };
      if (!isDemoMode()) {
        // Sign the canonical bind message with the merchant wallet. The domain
        // slot carries the NORMALIZED value — the same string the backend
        // stores and verifies against (see mirrors above + backend/README.md).
        const timestamp = Date.now();
        const message = widgetBindMessage(merchant, normalizeHost(domain.trim()), selectedPlan, timestamp);
        const signature = await signMessage(new TextEncoder().encode(message));
        sig = bs58.encode(signature);
        body = { ...body, signature: sig, timestamp };
      }
      const res = await fetch("/api/widget/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      domain = "";
      saved = true;
      // HTTP 201 means the backend verified the merchant's ed25519 signature
      // over the canonical bind message AND matched plan.merchant over RPC
      // before storing — the two ownership layers we display.
      if (res.status === 201) savedInfo = { plan: selectedPlan, merchant, signature: sig };
      await load();
    } catch (err) {
      errorKey = "embed.saveFail";
      error = err instanceof Error ? err.message : null;
    } finally {
      saving = false;
    }
  }

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snippet);
      copied = true;
      // One timer at a time: repeated clicks restart the "Copied ✓" window.
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        copied = false;
      }, 2000);
    } catch {
      errorKey = "embed.clipboardFail";
      error = null;
    }
  }

  // Re-load on merchant (dis)connect. The tracked dependency is the
  // synchronous `merchant` read inside load() (before its first await);
  // loadSeq drops responses of superseded runs.
  $effect(() => {
    void load();
  });

  // Unmount hygiene: the copy-feedback timer must not fire into a dead island.
  $effect(() => () => window.clearTimeout(copyTimer));
</script>

<div class="glass p-6 sm:p-8">
  <p class="font-mono text-[11px] tracking-wider text-white/40 uppercase" data-i18n="embed.eyebrow">embeddable widget</p>
  <h2 class="font-display mt-1 text-xl font-bold tracking-tight text-[#e1e1f0]" data-i18n="embed.title">Sell on your own site</h2>
  <p class="mt-1 text-sm leading-relaxed text-white/55" data-i18n="embed.lead">
    Bind a domain to a plan — the snippet works only there. Plan ownership is verified on-chain when you save.
  </p>

  {#if merchant === ""}
    <p class="mt-4 rounded-xl bg-white/[0.03] p-3 text-sm text-white/55" data-i18n="embed.connectFirst">Connect the merchant wallet first.</p>
  {:else}
    <div class="mt-4 grid items-start gap-4 lg:grid-cols-12">
      <div class="lg:col-span-5">
    <form class="grid gap-3" onsubmit={(e) => void save(e)}>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70" data-i18n="embed.plan">Plan</span>
        <select class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs" bind:value={selectedPlan}>
          {#if plans.length === 0}
            <option value="" disabled data-i18n="m2.emb.noPlans">No plans — create a plan above</option>
          {/if}
          {#each plans as p (p.address)}
            <option value={p.address}>{p.label}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70"><span data-i18n="embed.domain">Domain</span> <span class="text-white/35" data-i18n="embed.domainHint">(bare hostname, e.g. shop.example.com)</span></span>
        <input
          id="emb-domain"
          class="field emb-domain w-full min-w-0 px-3.5 py-2.5 font-mono text-xs"
          bind:value={domain}
          placeholder="shop.example.com"
          autocomplete="off"
          spellcheck={false}
          aria-invalid={errorKey === "embed.saveFail"}
          aria-describedby={errorKey !== null ? "emb-form-err" : undefined}
        />
      </label>
      <button type="submit" class="btn-stitch w-full cursor-pointer px-4 py-2.5 text-sm disabled:opacity-40" disabled={saving || selectedPlan === "" || domain.trim() === ""}>
        {saving ? $t("embed.saving") : $t("embed.save")}
      </button>
    </form>

    {#if errorKey !== null}
      <!-- Error = coral tokens; success = mint tokens (DESIGN.md semantic palette). -->
      <div id="emb-form-err" class="mt-3 rounded-xl bg-[#ff3b69]/[0.12] p-3 text-xs text-[#ffb4ab]" role="alert">
        <p>{$t(errorKey)}</p>
        {#if error !== null}
          <!-- Technical detail (server message / HTTP status) under the translated label. -->
          <p class="mt-1 break-all opacity-80">{error}</p>
        {/if}
        <button
          type="button"
          class="btn-ghost mt-2 cursor-pointer rounded-lg px-3 py-1.5 text-xs"
          onclick={() => void load()}
          data-i18n="port2.embed.retry"
        >
          Try again
        </button>
      </div>
    {/if}
    {#if saved}
      <p class="mt-3 rounded-xl bg-[#14f195]/[0.12] p-3 text-xs text-[#14f195]" data-i18n="embed.saved">Domain saved — the snippet below is live.</p>
    {/if}
    {#if savedInfo !== null}
      <p class="mt-3 rounded-xl bg-[#14f195]/[0.12] p-3 text-xs text-[#14f195]">
        <span class="font-bold">✓ <span data-i18n="port2.embed.ownership">Ownership: signed by merchant + verified on-chain (plan.merchant)</span></span>
        <br />
        <span class="font-mono text-[11px]">plan {savedInfo.plan.slice(0, 8)}… · merchant {savedInfo.merchant.slice(0, 8)}… · HTTP 201</span>
        {#if savedInfo.signature !== null}
          <br />
          <!-- Real Ed25519 signature returned by the wallet (bs58), truncated for display. -->
          <span class="block break-all font-mono text-[11px] text-[#14f195]/80">sig {savedInfo.signature.slice(0, 32)}…</span>
        {/if}
        <br />
        <span class="text-[#14f195]/70" data-i18n="port2.embed.ownershipDetail"
          >Your wallet signed the canonical bind message, and the backend still re-read the plan account from RPC and matched plan.merchant before storing.</span
        >
      </p>
    {/if}
    <div class="mt-3 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
      <div class="emb-lock">
        <p class="emb-lock-title" data-i18n="port2.lock.title">Strict origin control</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-[#e1e1f0]/70" data-i18n="port2.lock.body">A mismatched domain fails with 403 before any delegation is registered.</p>
      </div>
      <div class="emb-trust">
        <p class="emb-trust-title" data-i18n="m2.emb.blinks">Blinks ready</p>
        <p class="mt-0.5 text-[12px] leading-relaxed text-[#e1e1f0]/70" data-i18n="m2.emb.blinksBody">Every plan is a Solana Action — /blink renders a shareable Blink for it.</p>
      </div>
    </div>
    <div class="mt-4">
      <p class="text-xs font-medium text-white/60">
        <span data-i18n="embed.bound">Bound domains</span> {#if loading}<span data-i18n="embed.loading">(loading…)</span>{/if}
      </p>
      {#if sites.length === 0 && !loading}
        <p class="mt-1 text-xs text-white/40" data-i18n="embed.none">None yet — save your first domain above.</p>
      {:else}
        <ul class="mt-2 space-y-1.5">
          {#each sites as s (s.domain + s.plan)}
            <li class="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 font-mono text-xs">
              <span class="text-white/80">{s.domain}</span>
              <span class="truncate text-white/40">{s.plan.slice(0, 8)}…</span>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
      </div>

    <div class="mt-4 min-w-0 lg:col-span-7 lg:mt-0">
      {#if bindMessagePreview !== null}
        <div class="min-w-0">
          <p class="text-xs font-medium text-white/60" data-i18n="m2.emb.msgTitle">Widget-bind message (canonical, unsigned)</p>
          <pre class="codeblock mt-2">{bindMessagePreview}</pre>
          <p class="mt-1 text-[11px] leading-relaxed text-white/40" data-i18n="m2.emb.msgNote">Your wallet signs exactly this string when you save — with a fresh timestamp.</p>
        </div>
      {/if}
      <div class="mt-4 flex items-center justify-between">
        <p class="text-xs font-medium text-white/60" data-i18n="embed.snippet">Snippet</p>
        <button
          type="button"
          class="cursor-pointer rounded-lg bg-white/[0.06] px-3 py-1.5 font-mono text-[11px] text-white/70 transition-colors hover:bg-white/10"
          onclick={() => void copy()}
        >
          {copied ? $t("embed.copied") : $t("embed.copy")}
        </button>
      </div>
      <pre class="codeblock emb-snippet mt-2">{#each snippetSegs as seg, i (i)}{#if seg.cls !== ""}<span class={seg.cls}>{seg.text}</span>{:else}{seg.text}{/if}{/each}</pre>
    </div>
      </div>
  {/if}
</div>
<style>
  /* Module 03 Void skin (component scope). Cards use the global .glass. */
  .emb-lock {
    border: 1px solid rgba(255, 59, 105, 0.3);
    background: rgba(255, 59, 105, 0.08);
    border-radius: 12px;
    padding: 12px;
  }
  /* Funnel pass: domain is the hero field of this form — tabular, semibold. */
  .emb-domain {
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .emb-lock-title {
    font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #ff3b69;
  }
  .emb-snippet {
    overflow-x: auto;
    white-space: pre;
  }
  /* Snippet syntax accents (rare, over the neutral .codeblock base). */
  .es-tag {
    color: #00dbe9;
  }
  .es-str {
    color: #d8b9ff;
  }
  .es-api {
    color: #14f195;
  }
  /* Trust pair: coral 403 lock + mint Blinks readiness. */
  .emb-trust {
    border: 1px solid rgba(20, 241, 149, 0.3);
    background: rgba(20, 241, 149, 0.08);
    border-radius: 12px;
    padding: 12px;
  }
  .emb-trust-title {
    font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
    font-size: 14px;
    font-weight: 600;
    color: #14f195;
  }
</style>
