<script lang="ts">
  import type { Plan, Subscription } from "../lib/chain.js";
  import { formatPeriod, formatTokenAmount, secondsUntilCharge, shortAddr } from "../lib/chain.js";
  import { lang, t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-manage2.js";
  import Countdown from "./Countdown.svelte";

  /** On-chain SPL delegate state for the subscriber ATA (read via spl-token getAccount). */
  export interface CardAllowance {
    amount: bigint;
    delegate: string | null;
  }

  interface Props {
    sub: Subscription;
    plan: Plan | null;
    decimals: number;
    isMerchant: boolean;
    busy: boolean;
    busyKind: "cancel" | "charge" | null;
    /** undefined = allowance read in flight, null = none / no ATA. */
    allowance?: CardAllowance | null | undefined;
    onCancel: (sub: Subscription) => void;
    onCharge: (sub: Subscription) => void;
  }

  let { sub, plan, decimals, isMerchant, busy, busyKind, allowance = undefined, onCancel, onCharge }: Props = $props();

  // Reactive wall clock: frozen at mount, `dueIn`/`targetUnix` would never
  // reach the Charge state (dueIn === 0) on a long-lived /manage view.
  // 30 s cadence is enough — Countdown itself ticks every second.
  let nowSec = $state(Math.floor(Date.now() / 1000));
  $effect(() => {
    const id = window.setInterval(() => {
      nowSec = Math.floor(Date.now() / 1000);
    }, 30_000);
    return () => window.clearInterval(id);
  });
  const dueIn = $derived(plan === null ? 0 : secondsUntilCharge(sub.lastPaidAt, plan.periodSeconds, nowSec));
  const dateLocale = $derived($lang === "pl" ? "pl-PL" : "en-US");
  const lastPaidLabel = $derived(
    sub.lastPaidAt === 0n ? $t("subcard.neverCharged") : new Date(Number(sub.lastPaidAt) * 1000).toLocaleString(dateLocale),
  );
</script>

<article
  class="glass card-hover group flex h-full flex-col rounded-2xl p-5 {sub.status === 'cancelled'
    ? 'opacity-60'
    : ''}"
>
  <div class="flex items-start justify-between gap-3">
    <div class="min-w-0">
      <p class="font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase">
        {shortAddr(sub.address)} → plan {plan === null ? "…" : `#${plan.planId.toString()}`}{#if plan !== null}
          <span class="text-white/30"> · merchant {shortAddr(plan.merchant)}</span>
        {/if}
      </p>
      {#if plan !== null}
        <p class="font-display mt-1 text-2xl font-bold tracking-tight text-white tabular-nums">
          {formatTokenAmount(plan.amount, decimals)}
          <span class="text-sm font-medium text-white/50">/ {formatPeriod(plan.periodSeconds, $lang)}</span>
        </p>
      {:else}
        <p class="font-display mt-1 text-lg font-bold text-white/70" data-i18n="subcard.loadingPlan">Loading plan…</p>
      {/if}
    </div>
    {#if sub.status === "active"}
      <!-- .chip-active carries the pulsing dot, mono caps and mint hairline (global.css). -->
      <span class="chip-active shrink-0"><span data-i18n="subcard.active">active</span></span>
    {:else}
      <span class="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.06em] text-white/50 uppercase" data-i18n="subcard.cancelled">cancelled</span>
    {/if}
  </div>

  {#if plan !== null && sub.status === "active"}
    <div class="mt-4 flex flex-col gap-2 rounded-xl bg-white/[0.03] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p class="flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase">
        <!-- Icon sits OUTSIDE the data-i18n span: applyStaticLang replaces textContent and would wipe it. -->
        <span class="msym text-[20px] text-[#00dbe9]" aria-hidden="true">timer</span>
        <span data-i18n="subcard.nextPayment">next payment</span>
      </p>
      <Countdown targetUnix={nowSec + dueIn} size="lg" periodSeconds={Number(plan.periodSeconds)} />
    </div>
  {/if}

  <dl class="mt-3 space-y-1.5 font-mono text-xs text-white/55">
    <div class="flex justify-between gap-2">
      <dt data-i18n="subcard.lastPayment">last payment</dt>
      <dd class="text-white/85 tabular-nums">{lastPaidLabel}</dd>
    </div>
    <div class="flex items-center justify-between gap-2">
      <dt><span data-i18n="manage2.allowance">SPL delegated allowance</span> <span class="text-white/35">({$t("manage2.capNote")})</span></dt>
      <dd class="text-right text-white/85 tabular-nums">
        {#if allowance === undefined}
          <span class="text-white/40" data-i18n="manage2.allowanceLoading">reading allowance…</span>
        {:else if allowance === null}
          <span class="text-white/40" data-i18n="manage2.allowanceNone">no allowance (revoked or never approved)</span>
        {:else}
          <span class="font-semibold text-[#14f195]">{formatTokenAmount(allowance.amount, decimals)}</span>
          {#if allowance.delegate !== null}
            <span class="text-white/40"> → {$t("manage2.delegateTo")} {allowance.delegate.slice(0, 4)}…{allowance.delegate.slice(-4)}</span>
          {/if}
        {/if}
      </dd>
    </div>
  </dl>

  {#if sub.status === "active"}
    <div class="mt-auto grid grid-cols-2 gap-2 pt-5">
      {#if isMerchant && dueIn === 0}
        <button
          class="btn-primary cursor-pointer px-4 py-2.5 text-sm"
          disabled={busy}
          onclick={() => onCharge(sub)}
        >
          {busy && busyKind === "charge" ? $t("subcard.charging") : $t("subcard.chargeNow")}
        </button>
      {/if}
      <button
        class="cursor-pointer rounded-xl border border-[#ff3b69]/30 bg-transparent px-4 py-2.5 text-sm font-semibold text-[#ffb4ab] transition hover:bg-[#93000a] hover:text-[#ffdad6] disabled:cursor-wait disabled:opacity-60 {isMerchant
          && dueIn === 0
          ? ''
          : 'col-span-2'}"
        disabled={busy}
        onclick={() => onCancel(sub)}
      >
        {busy && busyKind === "cancel" ? $t("subcard.cancelling") : $t("subcard.cancel")}
      </button>
    </div>
  {/if}
</article>
