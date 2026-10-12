<script lang="ts">
  import { onMount } from "svelte";
  import type { ActionKind } from "../lib/blinks.js";
  import { actionUrl, blinkUrl } from "../lib/blinks.js";
  import { connection, fetchPlans, formatTokenAmount, shortAddr } from "../lib/chain.js";
  import type { Plan } from "../lib/chain.js";
  import { CUSTOM_MINT, DEVNET_USDC_MINT, KNOWN_MINTS, decimalsFor } from "../lib/mints.js";
  import { copyText, toast } from "../lib/ui.js";
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-port4.js";
  import "../lib/i18n-flows2.js";

  interface ActionPreview {
    title?: string;
    description?: string;
    label?: string;
    icon?: string;
    links?: { actions: { label: string; href: string }[] };
  }

  // All four kinds map to real backend endpoints (backend/src/routes.ts:
  // /api/actions/{plan,subscribe,cancel,charge}). The pattern's "tip / extend"
  // card has no endpoint here, so it is not offered.
  const KINDS: { id: ActionKind; key: string; en: string; descKey: string; signKey: string; icon: string }[] = [
    {
      id: "subscribe",
      key: "blinkb.kindSubscribe",
      en: "Subscribe",
      descKey: "flows2.kindSubDesc",
      signKey: "flows2.kindSubSign",
      icon: "loyalty",
    },
    {
      id: "cancel",
      key: "blinkb.kindCancel",
      en: "Cancel",
      descKey: "flows2.kindCancelDesc",
      signKey: "flows2.kindCancelSign",
      icon: "cancel",
    },
    {
      id: "charge",
      key: "blinkb.kindCharge",
      en: "Charge (merchant)",
      descKey: "flows2.kindChargeDesc",
      signKey: "flows2.kindChargeSign",
      icon: "receipt_long",
    },
    {
      id: "plan",
      key: "blinkb.kindPlan",
      en: "Create plan",
      descKey: "flows2.kindPlanDesc",
      signKey: "flows2.kindPlanSign",
      icon: "add_business",
    },
  ];

  const CUSTOM_PLAN = "custom";

  let kind: ActionKind = $state("subscribe");
  let planSel = $state("");
  let customPlan = $state("");
  let mintSel = $state(DEVNET_USDC_MINT);
  let customMint = $state("");
  let amount = $state("");
  let subscriber = $state("");
  let merchant = $state("");
  let merchantField = $state("");
  let planId = $state("1");
  let period = $state("2592000");
  let preview: ActionPreview | null = $state(null);
  let previewBusy = $state(false);
  let availablePlans = $state<Plan[]>([]);
  let plansLoading = $state(false);
  let plansFailed = $state(false);

  const plan = $derived(planSel === CUSTOM_PLAN ? customPlan.trim() : planSel);
  const mint = $derived(mintSel === CUSTOM_MINT ? customMint.trim() : mintSel);

  onMount(() => {
    void loadPlans();
  });

  async function loadPlans(): Promise<void> {
    plansLoading = true;
    plansFailed = false;
    try {
      availablePlans = await fetchPlans(connection());
    } catch {
      availablePlans = [];
      plansFailed = true;
    } finally {
      plansLoading = false;
    }
  }

  /** A picked plan fills mint (and the charge merchant) — no pasting. */
  function onPlanSelect(): void {
    const hit = availablePlans.find((p) => p.address.toBase58() === planSel);
    if (!hit) return;
    const mintAddr = hit.mint.toBase58();
    if (KNOWN_MINTS.some((m) => m.mint === mintAddr)) {
      mintSel = mintAddr;
      customMint = "";
    } else {
      mintSel = CUSTOM_MINT;
      customMint = mintAddr;
    }
    if (kind === "charge") merchant = hit.merchant.toBase58();
  }

  function planLabel(p: Plan): string {
    return `Plan #${p.planId.toString()} · ${shortAddr(p.address, 4)}…`;
  }

  const endpoint = $derived.by(() => {
    const base = { programId: import.meta.env.PUBLIC_SUBSCRIPTIONS_PROGRAM_ID };
    if (kind === "subscribe") return actionUrl(kind, { ...base, plan, mint, amount });
    if (kind === "cancel") return actionUrl(kind, { ...base, plan, mint });
    if (kind === "charge")
      return actionUrl(kind, { ...base, plan, mint, subscriber, merchant });
    return actionUrl(kind, { ...base, merchant: merchantField, planId, mint, amount, period });
  });

  function currentMissing(): string[] {
    const need: [string, string][] =
      kind === "subscribe"
        ? [["plan", plan], ["mint", mint], ["amount", amount]]
        : kind === "cancel"
          ? [["plan", plan], ["mint", mint]]
          : kind === "charge"
            ? [["plan", plan], ["mint", mint], ["subscriber", subscriber], ["merchant", merchant]]
            : [["merchant", merchantField], ["planId", planId], ["mint", mint], ["amount", amount], ["period", period]];
    return need.filter(([, v]) => v.trim().length === 0).map(([k]) => k);
  }

  /** Human price for the feed simulator: UI units + symbol, or honest "raw". */
  function priceLabel(): string {
    if (kind !== "subscribe" && kind !== "charge" && kind !== "plan") return "—";
    const raw = amount.trim();
    if (!/^\d+$/.test(raw)) return "—";
    const dec = decimalsFor(mint);
    const sym = KNOWN_MINTS.find((m) => m.mint === mint)?.symbol ?? "SPL";
    if (dec !== null) return `${formatTokenAmount(BigInt(raw), dec)} ${sym}`;
    return `${raw} raw ${sym === "SPL" ? "· custom mint" : ""}`.trim();
  }

  // Bridge to the static X-feed simulator on /blink: it lives in the page
  // (not this island), so state travels over a DOM event. Title/description
  // come from the real GET metadata (preview), price from this form. `blink`
  // is the primary shareable solana-action: URL; `endpoint` is the plain
  // https GET whose JSON a browser can render directly.
  interface FeedState {
    title: string | null;
    description: string | null;
    price: string;
    blink: string;
    endpoint: string;
    ready: boolean;
  }
  const feedState: FeedState = $derived.by(() => ({
    title: preview?.title ?? null,
    description: preview?.description ?? null,
    price: priceLabel(),
    blink: blinkUrl(endpoint),
    endpoint,
    ready: currentMissing().length === 0,
  }));

  // Publish on every state change — dispatch the $derived value itself
  // (compute, don't sync): a snapshot variable would go stale between a
  // feedState change and this effect's re-run.
  $effect(() => {
    document.dispatchEvent(new CustomEvent("blinkbuilder:state", { detail: feedState }));
  });
  // …and answer "blinkbuilder:sync" in case the page's listener registered
  // after our initial dispatch (hydration vs module-script race). Reading the
  // derived inside the handler always yields the fresh value.
  $effect(() => {
    const onSync = (): void => {
      document.dispatchEvent(new CustomEvent("blinkbuilder:state", { detail: feedState }));
    };
    document.addEventListener("blinkbuilder:sync", onSync);
    return () => document.removeEventListener("blinkbuilder:sync", onSync);
  });

  async function loadPreview(): Promise<void> {
    const myEndpoint = endpoint;
    preview = null;
    previewBusy = true;
    try {
      const res = await fetch(myEndpoint);
      const json = (await res.json()) as ActionPreview & { message?: string };
      // A kind/param change re-pointed `endpoint` mid-flight — drop the stale
      // response instead of gluing old metadata onto the new configuration.
      if (endpoint !== myEndpoint) return;
      if (!res.ok) throw new Error(json.message ?? `HTTP ${res.status}`);
      preview = json;
    } catch (err) {
      if (endpoint !== myEndpoint) return; // superseded — never toast stale
      toast.err($t("blinkb.previewFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      // Reset for both paths — a successful GET used to leave the button
      // stuck on "Loading…" forever. A superseded run must not clear the
      // flag of a newer in-flight one.
      if (endpoint === myEndpoint) previewBusy = false;
    }
  }

  // Copies the primary solana-action: URL and confirms right at the button
  // ("Copied ✓") — the shared toast alone is easy to miss next to the click.
  let blinkCopied = $state(false);
  let blinkCopyTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyBlink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(blinkUrl(endpoint));
      blinkCopied = true;
      window.clearTimeout(blinkCopyTimer);
      blinkCopyTimer = window.setTimeout(() => {
        blinkCopied = false;
      }, 2000);
    } catch {
      toast.err($t("ui.copyFail"));
    }
  }

  // Unmount hygiene: the "Copied ✓" timer must not fire into a dead island.
  $effect(() => () => window.clearTimeout(blinkCopyTimer));
</script>

<div class="grid grid-cols-1 items-start gap-4">
  <div class="min-w-0 rounded-2xl border border-white/[0.08] bg-[#191b25] p-6 shadow-xl">
    <div class="flex items-center justify-between">
      <p class="flex items-center gap-2 font-display text-[15px] font-semibold text-white/90">
        <span class="msym text-[20px] text-[#d8b9ff]" aria-hidden="true">tune</span>
        <span data-i18n="port4.step1t">1. Target action type</span>
      </p>
      <span class="font-mono text-[11px] tracking-wider text-white/35 uppercase" data-i18n="port4.step1s">STEP 01 / 03</span>
    </div>
    <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      {#each KINDS as k (k.id)}
        <button
          aria-pressed={kind === k.id}
          class="group flex cursor-pointer flex-col justify-between gap-3 rounded-xl p-3.5 text-left transition-all {kind === k.id
            ? 'bg-[#282934] text-white shadow-md'
            : 'bg-[#1d1f29] text-white/55 hover:bg-[#282934] hover:text-white/90'}"
          onclick={() => {
            kind = k.id;
            preview = null;
          }}
        >
          <span class="flex items-center justify-between">
            <span class="msym text-[22px] {kind === k.id ? 'text-[#d8b9ff]' : 'text-white/40 group-hover:text-white/70'}" aria-hidden="true">{k.icon}</span>
            {#if kind === k.id}
              <span class="h-2 w-2 rounded-full bg-[#14f195] shadow-[0_0_8px_#14f195]" aria-hidden="true"></span>
            {/if}
          </span>
          <span class="flex flex-col">
            <span class="font-display text-[15px] font-semibold">{$t(k.key)}</span>
            <span class="mt-0.5 text-xs leading-snug {kind === k.id ? 'text-white/60' : 'text-white/40'}">{$t(k.descKey)}</span>
          </span>
          <span class="font-mono text-[11px] tracking-wider uppercase {kind === k.id ? 'text-[#14f195]' : 'text-white/35'}">{$t(k.signKey)}</span>
        </button>
      {/each}
    </div>
    <p class="mt-3 flex items-center gap-2 font-mono text-[11px] text-white/35">
      <span class="inline-block h-2 w-2 shrink-0 rounded-full bg-[#14f195] shadow-[0_0_8px_#14f195]"></span>
      <span class="break-all">{endpoint}</span>
    </p>

    <div class="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
      <p class="flex items-center gap-2 font-display text-[15px] font-semibold text-white/90">
        <span class="msym text-[20px] text-[#a0ffc3]" aria-hidden="true">dataset</span>
        <span data-i18n="port4.step2t">2. Parameters</span>
      </p>
      <span class="font-mono text-[11px] tracking-wider text-white/35 uppercase" data-i18n="port4.step2s">STEP 02 / 03</span>
    </div>
    <div class="mt-4 grid gap-3">
      {#if kind === "subscribe" || kind === "cancel" || kind === "charge"}
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70" data-i18n="blinkb.planFromChain">Plan (from chain)</span>
          <select
            class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs"
            bind:value={planSel}
            onchange={onPlanSelect}
            disabled={plansLoading}
          >
            <option value="">{plansLoading ? $t("blinkb.loadingPlans") : $t("blinkb.choosePlan")}</option>
            {#each availablePlans as p (p.address.toBase58())}
              <option value={p.address.toBase58()}>{planLabel(p)}</option>
            {/each}
            <option value={CUSTOM_PLAN} data-i18n="blinkb.customAddr">Custom address…</option>
          </select>
          {#if plansFailed}
            <span class="font-mono text-[11px] text-[#ffb4ab]" data-i18n="blinkb.chainDown">Chain unavailable — pick “Custom address…”.</span>
          {/if}
        </label>
        {#if planSel === CUSTOM_PLAN}
          <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70" title={$t("flows2.planPdaHint")}>{$t("flows2.planPda")}</span>
            <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={customPlan} placeholder="7x…" spellcheck={false} /></label>
        {/if}
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70">{$t("flows2.mintLabel")}</span>
          <select class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={mintSel}>
            {#each KNOWN_MINTS as m (m.mint)}
              <option value={m.mint}>{m.mint === CUSTOM_MINT ? $t("blinkb.customMint") : m.label}{m.mint !== CUSTOM_MINT ? ` · ${m.mint.slice(0, 6)}…` : ""}</option>
            {/each}
          </select>
          {#if mintSel === CUSTOM_MINT}
            <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={customMint} placeholder="4zMM…" spellcheck={false} />
          {/if}
        </label>
      {/if}
      {#if kind === "subscribe" || kind === "plan"}
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70" data-i18n="blinkb.amountLabel">Amount (raw units per period)</span>
          <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono" inputmode="numeric" bind:value={amount} placeholder="1000000" /></label>
      {/if}
      {#if kind === "charge"}
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70">{$t("flows2.subscriberLabel")}</span>
          <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={subscriber} placeholder="Gx…" spellcheck={false} /></label>
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70">{$t("flows2.merchantLabel")}</span>
          <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={merchant} placeholder="Hx…" spellcheck={false} /></label>
      {/if}
      {#if kind === "plan"}
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70">{$t("flows2.merchantLabel")}</span>
          <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={merchantField} placeholder="Hx…" spellcheck={false} /></label>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70" data-i18n="flows2.planIdLabel">Plan ID</span>
            <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono" inputmode="numeric" bind:value={planId} /></label>
          <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70" data-i18n="blinkb.periodLabel">Period (sec)</span>
            <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono" inputmode="numeric" bind:value={period} /></label>
        </div>
        <label class="flex flex-col gap-1.5 text-sm"><span class="text-white/70">{$t("flows2.mintLabel")}</span>
          <select class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={mintSel}>
            {#each KNOWN_MINTS as m (m.mint)}
              <option value={m.mint}>{m.mint === CUSTOM_MINT ? $t("blinkb.customMint") : m.label}{m.mint !== CUSTOM_MINT ? ` · ${m.mint.slice(0, 6)}…` : ""}</option>
            {/each}
          </select>
          {#if mintSel === CUSTOM_MINT}
            <input class="field w-full rounded-lg px-3.5 py-2.5 font-mono text-xs" bind:value={customMint} placeholder="4zMM…" spellcheck={false} />
          {/if}
        </label>
      {/if}
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button class="btn-primary cursor-pointer rounded-lg px-4 py-2.5 text-sm" disabled={previewBusy} onclick={() => void loadPreview()}>
        {previewBusy ? $t("blinkb.loading") : $t("blinkb.preview")}
      </button>
      <button class="btn-ghost cursor-pointer rounded-lg px-4 py-2.5 text-sm" onclick={() => void copyText(endpoint, $t("blinkb.endpointUrl"))} data-i18n="blinkb.copyEndpoint">
        Copy endpoint
      </button>
    </div>
    {#if currentMissing().length > 0}
      <p class="mt-2 font-mono text-[11px] text-white/40">{$t("blinkb.fillIn")}: {currentMissing().join(", ")} {$t("blinkb.fillInTail")}</p>
    {/if}

    <div class="mt-6 flex items-center justify-between border-t border-white/[0.06] pt-4">
      <p class="flex items-center gap-2 font-display text-[15px] font-semibold text-white/90">
        <span class="msym text-[20px] text-[#d8b9ff]" aria-hidden="true">share</span>
        <span data-i18n="flows2.step3t">3. Ready link & export</span>
      </p>
      <span class="font-mono text-[11px] tracking-wider text-white/35 uppercase" data-i18n="port4.step3s">STEP 03 / 03</span>
    </div>
    <div class="mt-4 rounded-xl bg-[#0c0e17] p-4">
      <div class="flex items-center justify-between gap-2">
        <span class="font-mono text-[11px] tracking-wider text-[#00f0ff] uppercase" data-i18n="flows2.actionUrlLabel">solana-action URL</span>
        <span class="font-mono text-[11px] text-white/35" data-i18n="port4.getpost">GET / POST payload</span>
      </div>
      <p class="mt-2 font-mono text-[12px] break-all text-[#a0ffc3]">{blinkUrl(endpoint)}</p>
      <div class="mt-3 flex flex-wrap gap-2">
        <!-- Primary share = the solana-action: URL itself. Wallets (Phantom,
             Solflare) consume it directly, so copy + at-button feedback is the
             whole export path — no third-party gateway link here. -->
        <button class="btn-primary flex cursor-pointer items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm" onclick={() => void copyBlink()}>
          <span class="msym text-[16px]" aria-hidden="true">content_copy</span>
          <span data-i18n="blinkb.copyBlink">Copy Blink</span>
          {#if blinkCopied}
            <span class="flex shrink-0 items-center gap-0.5 text-[#14f195]">
              <span class="msym text-[16px]" aria-hidden="true">check</span>
              <span data-i18n="flows2.copied">Copied.</span>
            </span>
          {/if}
        </button>
        <!-- Secondary: a plain GET of our own endpoint renders the action
             metadata JSON right in the browser. -->
        <a class="btn-ghost flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm" href={endpoint} target="_blank" rel="noreferrer">
          <span class="msym text-[16px]" aria-hidden="true">data_object</span>
          <span data-i18n="flows2.openJson">Open endpoint JSON ↗</span>
        </a>
      </div>
    </div>
  </div>

  <div class="min-w-0 rounded-2xl border border-white/[0.08] bg-[#191b25] p-6 shadow-xl">
    <div class="flex items-center justify-between">
      <p class="font-mono text-[11px] tracking-wider text-white/40 uppercase" data-i18n="blinkb.previewTitle">Blink preview</p>
      <span class="rounded bg-[#282934] px-2 py-0.5 font-mono text-[11px] text-[#00f0ff]" data-i18n="port4.feedBadge">X-feed preview</span>
    </div>
    {#if preview === null}
      <div class="mt-3 rounded-xl border border-dashed border-white/15 bg-[#0c0e17] p-8 text-center text-sm text-white/45" data-i18n="blinkb.previewEmpty">
        Click “Preview action” — we fetch GET metadata from the endpoint and render the card the way a wallet will show it.
      </div>
    {:else}
      <div class="mt-3 overflow-hidden rounded-xl border border-white/10 bg-[#0c0e17] shadow-lg">
        {#if preview.icon}
          <div class="relative h-36 w-full overflow-hidden">
            <img src={preview.icon} alt="" class="h-full w-full object-cover" />
            <div class="absolute inset-0 bg-gradient-to-t from-[#191b25] via-transparent to-transparent"></div>
            <div class="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-[#0c0e17]/80 px-2.5 py-1 backdrop-blur-md">
              <span class="h-1.5 w-1.5 rounded-full bg-[#14f195]"></span>
              <span class="font-mono text-[11px] tracking-wider text-[#14f195] uppercase" data-i18n="port4.zeroCustody">Zero Custody</span>
            </div>
          </div>
        {/if}
        <div class="flex flex-col gap-3 p-4">
          <div>
            <p class="font-display text-[17px] font-bold text-white/95">{preview.title ?? $t("blinkb.untitled")}</p>
            {#if preview.description}
              <p class="mt-1 line-clamp-2 text-sm text-white/60">{preview.description}</p>
            {/if}
          </div>
          <div class="flex items-center justify-between rounded-lg bg-[#191b25] px-3 py-2">
            <span class="font-mono text-[11px] tracking-wider text-white/40 uppercase" data-i18n="port4.rateLabel">Recurring rate:</span>
            <span class="font-mono text-[13px] text-[#14f195]" data-i18n="flows2.ratePerTx">1 period / tx</span>
          </div>
          <div class="grid grid-cols-1 gap-2 min-[440px]:grid-cols-2">
            {#each preview.links?.actions ?? [] as a (a.href)}
              <span class="rounded-lg bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3 py-2.5 text-center text-sm font-semibold text-white">{a.label}</span>
            {:else}
              <span class="col-span-2 rounded-lg bg-gradient-to-r from-[#9945ff] to-[#14f195] px-3 py-2.5 text-center text-sm font-semibold text-white">{preview.label ?? $t("blinkb.send")}</span>
            {/each}
          </div>
          <div class="flex items-center justify-between pt-1 font-mono text-[11px] text-white/35">
            <span>action.version: 2.1</span>
            <span class="flex items-center gap-1 text-white/55">
              <span class="msym text-[13px] text-[#00dbe9]" aria-hidden="true">lock</span>
              <span data-i18n="flows2.securedBy">Secured by the Actions spec</span>
            </span>
          </div>
        </div>
      </div>
    {/if}
    <div class="mt-3 flex flex-col gap-2 rounded-lg bg-[#0c0e17] p-4">
      <div class="flex items-center justify-between">
        <span class="flex items-center gap-1.5 font-mono text-[11px] tracking-wider text-[#00f0ff] uppercase" data-i18n="port4.uriSchema">solana-action URI schema:</span>
        <span class="font-mono text-[11px] text-white/35" data-i18n="port4.getpost">GET / POST payload</span>
      </div>
      <p class="font-mono text-[13px] break-all text-[#d8b9ff]">{endpoint}</p>
    </div>
  </div>
</div>
