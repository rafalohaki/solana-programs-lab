<script lang="ts">
  import type { Plan } from "../lib/chain.js";
  import { CLUSTER, formatPeriod, formatTokenAmount, shortAddr } from "../lib/chain.js";
  import { subscribeActionUrl } from "../lib/blinks.js";
  import { copyText } from "../lib/ui.js";
  import { lang, t } from "../lib/i18n.js";
  import { DEVNET_USDC_MINT, KNOWN_MINTS } from "../lib/mints.js";
  import { planCategoryKey, type PlanCategory, type PlanMeta } from "../lib/plansMeta.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-port1.js";
  import "../lib/i18n-home2.js";
  import FeeBadge from "./FeeBadge.svelte";
  import { formatUsd, usdEstimate } from "../lib/pyth.js";

  interface Props {
    plan: Plan;
    decimals: number;
    busy: boolean;
    connected: boolean;
    onSubscribe: (plan: Plan) => void;
    /** Merchant-declared metadata when it exists — everything on the card
     *  falls back to the on-chain-only view ("Plan #N") when absent. */
    meta?: PlanMeta | null;
  }

  let { plan, decimals, busy, connected, onSubscribe, meta = null }: Props = $props();

  /** Wrapped SOL mint — the only "SOL" symbol we can claim truthfully. */
  const WSOL_MINT = "So11111111111111111111111111111111111111112";

  /** Cluster-aware explorer deep link for an account (same pattern as Layout.astro). */
  function explorerAccountUrl(base58: string): string {
    return CLUSTER === "mainnet-beta"
      ? `https://explorer.solana.com/address/${base58}`
      : `https://explorer.solana.com/address/${base58}?cluster=${CLUSTER}`;
  }

  function mintSymbol(mintBase58: string): string | null {
    if (mintBase58 === WSOL_MINT) return "SOL";
    if (mintBase58 === DEVNET_USDC_MINT) return "USDC";
    const hit = KNOWN_MINTS.find((m) => m.mint === mintBase58 && m.symbol !== "CUSTOM");
    return hit?.symbol ?? null;
  }

  const mintAddr = $derived(plan.mint.toBase58());
  const symbol = $derived(mintSymbol(mintAddr));
  // Unknown mint: NEVER a raw hash or an invented name as the token label —
  // the cost rows link the 4…4 address to the Explorer instead.

  // Single-accent discipline: one purple hairline on top (opacity varies),
  // everything shown stays derived from on-chain facts.
  const variant = $derived(Number(plan.planId % 2n));

  const ACCENTS = ["bg-[#9945ff]/70", "bg-[#9945ff]/40"];

  const PILLS = [
    { icon: "bolt", cls: "border-[rgba(20,241,149,0.3)] bg-[rgba(0,236,145,0.15)] text-[#a0ffc3]" },
    { icon: "autorenew", cls: "border-[rgba(153,69,255,0.45)] bg-[rgba(153,69,255,0.15)] text-[#d8b9ff]" },
  ];

  const TILES = [
    { icon: "ssid_chart", cls: "text-[#14f195]" },
    { icon: "dns", cls: "text-[#d8b9ff]" },
  ];

  const valueTone = "text-white";

  // Category badge styling (Solana triada palette, same family as PILLS
  // above). Only rendered when the merchant declared a category — no badge
  // is ever invented for an undeclared plan.
  const CATEGORY_BADGES: Record<PlanCategory, { icon: string; cls: string }> = {
    saas: { icon: "cloud_done", cls: "border-[rgba(20,241,149,0.3)] bg-[rgba(0,236,145,0.12)] text-[#a0ffc3]" },
    rpc: { icon: "dns", cls: "border-[rgba(0,219,233,0.35)] bg-[rgba(0,219,233,0.12)] text-[#7df4ff]" },
    ai: { icon: "psychology", cls: "border-[rgba(153,69,255,0.45)] bg-[rgba(153,69,255,0.15)] text-[#d8b9ff]" },
    community: { icon: "groups", cls: "border-white/10 bg-white/[0.06] text-white/60" },
    devtools: { icon: "terminal", cls: "border-[rgba(0,219,233,0.25)] bg-[rgba(153,69,255,0.1)] text-[#00dbe9]" },
  };

  const categoryBadge = $derived(meta?.category !== null && meta?.category !== undefined ? CATEGORY_BADGES[meta.category] : null);

  // USD estimate next to the price (Pyth Hermes; USDC is exactly 1, wSOL via
  // the live SOL/USD feed, anything else has no source). Null = no price
  // source or fetch failure: the card renders nothing, never a fake number.
  let estimate: number | null = $state(null);
  $effect(() => {
    const mint = mintAddr;
    const uiAmount = Number(plan.amount) / 10 ** decimals;
    let live = true;
    estimate = null;
    void usdEstimate(mint, uiAmount).then((value) => {
      if (live) estimate = value;
    });
    return () => {
      live = false;
    };
  });
</script>

<article class="glass card-hover group relative flex h-full flex-col justify-between overflow-hidden rounded-xl p-5">
  <div class={`absolute inset-x-0 top-0 h-0.5 ${ACCENTS[variant]}`}></div>
  <div>
    <div class="mb-4 flex items-center justify-between gap-2">
      <span class={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase ${PILLS[variant].cls}`}>
        <span class="msym text-[14px]" aria-hidden="true">{PILLS[variant].icon}</span>
        {$t("plan.tag")}
      </span>
      <span class="flex items-center gap-1.5 font-mono text-[11px] text-white/45">
        {$t("plan.planId")} #{plan.planId.toString()}
        <span
          class="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#14f195]"
          title="Plan active on-chain"
          data-i18n-title="plancard.activePlan"
        ></span>
      </span>
    </div>

    <div class="mb-4 flex items-center gap-3">
      <div class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#32343f] ${TILES[variant].cls}`}>
        <span class="msym text-[22px]" aria-hidden="true">{TILES[variant].icon}</span>
      </div>
      <div class="min-w-0">
        <div class="flex min-w-0 items-center gap-2">
          <!-- Merchant-declared title when metadata exists; on-chain fallback "Plan #N" otherwise. -->
          <h3
            class="font-display truncate text-[22px] leading-7 font-semibold tracking-tight text-white"
            title={meta?.title ?? undefined}
          >
            {meta?.title ?? `${$t("home2.planFallback")} #${plan.planId.toString()}`}
          </h3>
          {#if categoryBadge !== null && meta?.category}
            <span
              class={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.08em] uppercase ${categoryBadge.cls}`}
              title={$t("home2.meta.declaredTip")}
            >
              <span class="msym text-[12px]" aria-hidden="true">{categoryBadge.icon}</span>
              {$t(planCategoryKey(meta.category))}
            </span>
          {/if}
        </div>
        <p class="flex min-w-0 items-center gap-1 font-mono text-[13px] text-white/50">
          <span data-i18n="home2.cardBy">by</span>
          <a
            href={explorerAccountUrl(plan.merchant.toBase58())}
            target="_blank"
            rel="noreferrer"
            class="mono-address cursor-pointer text-[#7df4ff] transition-colors hover:text-[#00f0ff] hover:underline"
            title={plan.merchant.toBase58()}>{shortAddr(plan.merchant)}</a
          >
          {#if meta?.handle}
            <!-- Merchant-declared display handle; the address above stays the authoritative link. -->
            <span class="min-w-0 truncate" title={$t("home2.meta.declaredTip")}>· @{meta.handle}</span>
          {/if}
        </p>
      </div>
    </div>

    {#if meta?.description}
      <p class="mb-2 text-sm leading-relaxed text-white/70" title={$t("home2.meta.declaredTip")}>{meta.description}</p>
    {/if}
    <p class="mb-3 text-sm leading-relaxed text-white/55">
      {formatPeriod(plan.periodSeconds, $lang)}
      <span class="text-white/70">·</span>
      <span data-i18n="plan.cardDesc">Auto-renews each period at the price above · no vault — funds stay in your wallet · cancel anytime in My subscriptions, revoking the delegate stops billing · charges are final, the protocol has no refunds</span>
    </p>
    <div class="mb-5">
      <FeeBadge amount={plan.amount} decimals={decimals} symbol={symbol ?? undefined} />
    </div>

    <dl class="mb-6 space-y-2.5 rounded-lg bg-[#191b25] p-4">
      <!-- Price hero: amount + token dominate the card; period is secondary. -->
      <div class="flex items-start justify-between gap-3">
        <dt class="pt-1.5 text-xs text-white/55" data-i18n="plan.cost">Cost / cycle:</dt>
        <dd class={`tnum min-w-0 max-w-[62%] text-right font-mono text-[28px] leading-9 font-semibold tracking-tight break-words ${valueTone}`}>
          {formatTokenAmount(plan.amount, decimals)}
          {#if symbol}
            {" "}<span class="font-sans text-sm font-medium text-white/45">{symbol}</span>
          {:else}<a
            href={explorerAccountUrl(mintAddr)}
            target="_blank"
            rel="noreferrer"
            class="inline-flex cursor-pointer items-center gap-1 font-mono text-sm font-medium text-white/60 underline decoration-dotted underline-offset-4 transition-colors hover:text-[#00f0ff]"
            title={mintAddr}><span class="msym text-[16px]" aria-hidden="true">token</span>{shortAddr(plan.mint)}</a
          >{/if}
          <span class="block font-sans text-xs font-normal text-white/55">/ {formatPeriod(plan.periodSeconds, $lang)}</span>
          {#if estimate !== null}
            <span class="block font-sans text-[11px] font-normal text-white/40">≈ {formatUsd(estimate)}</span>
          {/if}
        </dd>
      </div>
      <div class="hairline flex items-center justify-between gap-2 pt-2.5">
        <dt class="text-xs text-white/55" data-i18n="plan.allowance">SPL Delegate limit:</dt>
        <dd
          class="rounded bg-[#1d1f29] px-2 py-0.5 font-mono text-[11px] tracking-[0.06em] text-white/85 uppercase"
          title={plan.amount.toString()}
        >
          {formatTokenAmount(plan.amount, decimals)}
          {#if symbol}
            {" "}{symbol}
          {:else}<a
            href={explorerAccountUrl(mintAddr)}
            target="_blank"
            rel="noreferrer"
            class="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-[#00f0ff]"
            title={mintAddr}>{shortAddr(plan.mint)}</a
          >{/if}
        </dd>
      </div>
      <div class="hairline flex items-center justify-between gap-2 pt-2.5">
        <dt class="text-xs text-white/55" data-i18n="plan.settlement">Settlement:</dt>
        <dd class="font-mono text-[11px] tracking-[0.06em] text-[#00dbe9] uppercase" title={plan.merchant.toBase58()}>
          {$t("plan.settlementMethod")}
        </dd>
      </div>
      <div class="hairline flex items-center justify-between gap-2 pt-2.5 text-white/50">
        <dt class="text-[11px]" data-i18n="plancard.planAddr">plan address</dt>
        <dd class="font-mono text-[11px]">
          <button
            type="button"
            class="cursor-pointer text-white/60 transition-colors hover:text-[#00f0ff]"
            title="Copy plan address"
            data-i18n-title="home2.copyAddr"
            aria-label={`${$t("home2.copyAddr")}: ${shortAddr(plan.address)}`}
            onclick={() => void copyText(plan.address.toBase58(), $t("home2.addrLabel"))}
          >
            {shortAddr(plan.address)}
          </button>
        </dd>
      </div>
    </dl>
  </div>

  <div>
    <button
      class="btn-stitch flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50"
      disabled={busy}
      onclick={() => onSubscribe(plan)}
    >
      <span class="msym text-[18px]" aria-hidden="true">verified</span>
      {busy ? $t("plancard.signing") : $t("plan.subscribe")}
    </button>
    <div class="mt-2 flex items-center justify-between gap-2">
      <button
        class="btn-ghost cursor-pointer rounded-lg px-3 py-2"
        title="Copy Blink URL (solana-action)"
        data-i18n-title="plancard.copyBlink"
        aria-label="Copy Blink URL (solana-action)"
        data-i18n-aria="plancard.copyBlink"
        onclick={() =>
          void copyText(
            subscribeActionUrl(plan.address.toBase58(), plan.mint.toBase58(), plan.amount.toString()),
            $t("plancard.blinkUrlLabel"),
          )}
      >
        <span class="msym block text-[18px]" aria-hidden="true">bolt</span>
      </button>
      {#if !connected}
        <p class="text-right text-[11px] text-white/40">{$t("plancard.needWallet")}</p>
      {/if}
    </div>
  </div>
</article>
