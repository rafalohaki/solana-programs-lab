<script lang="ts">
  // Stitch D3 port (honest edition): a confirmation step BEFORE the wallet
  // popup. Every number on screen is an on-chain fact — plan amount, period,
  // delegate limit (= exactly one period's amount, enforced client-side too by
  // assertTxSafe). The "you sign" block mirrors the real atomic transaction:
  // spl_token::approve + program subscribe in ONE tx (Model B). Confirm routes
  // into the EXISTING Actions flow (PlansGrid subscribe → signAndSendAction);
  // this component opens no second signing path. Escape / backdrop click /
  // close button dismiss; basic focus trap; body scroll locked while open.
  import type { Plan } from "../lib/chain.js";
  import {
    explorerAccountUrl,
    findSubscriptionPda,
    formatPeriod,
    formatTokenAmount,
    shortAddr,
  } from "../lib/chain.js";
  import { wallet } from "../lib/wallet.js";
  import { lang, t } from "../lib/i18n.js";
  import "../lib/i18n-app.js"; // plancard.signing / plancard.needWallet reuse
  import "../lib/i18n-home2.js"; // submodal.*

  interface Props {
    plan: Plan | null;
    decimals: number;
    /** Resolved mint symbol; null falls back to the short mint address. */
    symbol: string | null;
    /** Parent's per-plan busy flag — also disables this dialog's confirm. */
    busy: boolean;
    onConfirm: (plan: Plan) => void;
    onClose: () => void;
  }

  let { plan, decimals, symbol, busy, onConfirm, onClose }: Props = $props();

  let panelEl: HTMLDivElement | null = $state(null);
  let previouslyFocused: HTMLElement | null = null;

  const unit = $derived(symbol ?? (plan === null ? "" : shortAddr(plan.mint)));
  const amountLabel = $derived(plan === null ? "" : formatTokenAmount(plan.amount, decimals));
  const periodLabel = $derived(plan === null ? "" : formatPeriod(plan.periodSeconds, $lang));
  /** Real program-derived subscription address for THIS wallet + plan. */
  const subPda = $derived(
    plan !== null && $wallet.address !== null
      ? (findSubscriptionPda(plan.address, $wallet.address)[0] ?? null)
      : null,
  );

  // --- open/close plumbing: focus hand-off, trap, Escape, scroll lock --------
  $effect(() => {
    if (plan === null) return;
    previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Hand focus to the dialog panel once it is in the DOM (tabindex="-1").
    queueMicrotask(() => panelEl?.focus());

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || panelEl === null) return;
      // Basic focus trap: cycle Tab / Shift+Tab across the panel's focusables.
      const focusables = Array.from(
        panelEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      const inside = active !== null && panelEl.contains(active);
      if (!inside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Freeze the page behind the dialog; restore the previous value on close.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus();
    };
  });
</script>

{#if plan !== null}
  <!-- Backdrop covers the viewport; toasts (z-50) intentionally sit above it
       so the subscribe outcome stays visible over the dialog. Escape/Tab are
       handled on window inside the $effect above; role="presentation" marks
       this cover as decorative for assistive tech. -->
  <div
    role="presentation"
    class="sm-backdrop fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <div
      bind:this={panelEl}
      class="glass sm-pop relative my-auto max-h-[calc(100dvh-2rem)] min-w-0 w-full max-w-lg overflow-y-auto rounded-2xl p-6 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submodal-title"
      tabindex="-1"
    >
      <button
        type="button"
        class="absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white"
        onclick={() => onClose()}
        title={$t("submodal.close")}
        aria-label={$t("submodal.close")}
      >
        ✕
      </button>

      <!-- Header: real plan id + real merchant address — never a mock title. -->
      <div class="mb-5 flex items-start gap-3.5 pr-8">
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#9945FF]/40 bg-gradient-to-br from-[#9945FF]/30 to-[#14f195]/20 text-[#14f195]"
        >
          <span class="msym text-[22px]" aria-hidden="true">bolt</span>
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 id="submodal-title" class="font-display text-lg font-bold text-white">
              {$t("submodal.title")}
            </h3>
            <span class="rounded border border-[#2b334f] bg-[#1a1f33] px-2 py-0.5 font-mono text-[10px] text-[#00dbe9]">
              #{plan.planId.toString()}
            </span>
          </div>
          <p class="mt-0.5 flex min-w-0 items-center gap-1 font-mono text-xs text-white/40">
            {$t("home2.cardBy")}
            <a
              href={explorerAccountUrl(plan.merchant.toBase58())}
              target="_blank"
              rel="noreferrer"
              class="mono-address text-[#7df4ff] transition-colors hover:text-[#00f0ff] hover:underline"
              title={plan.merchant.toBase58()}>{shortAddr(plan.merchant)}</a
            >
          </p>
        </div>
      </div>

      <!-- Plan summary: kwota / okres / limit delegacji (= amount). -->
      <dl class="mb-4 space-y-2.5 rounded-xl bg-[#191b25]/80 p-4">
        <div class="flex items-center justify-between gap-2">
          <dt class="text-xs text-white/40">{$t("plan.cost")}</dt>
          <dd class="tnum font-mono text-lg font-semibold tracking-tight text-white">
            {amountLabel} {unit}
            <span class="font-sans text-xs font-normal text-white/45">/ {periodLabel}</span>
          </dd>
        </div>
        <div class="hairline flex items-center justify-between gap-2 pt-2.5">
          <dt class="text-xs text-white/40">{$t("plan.allowance")}</dt>
          <dd class="tnum font-mono text-xs text-white/85">
            {amountLabel} {unit}
            <span class="text-white/40">{$t("plan.allowanceNote")}</span>
          </dd>
        </div>
        <div class="hairline flex items-center justify-between gap-2 pt-2.5">
          <dt class="text-xs text-white/40">{$t("submodal.walletLabel")}</dt>
          <dd class="font-mono text-xs">
            {#if $wallet.address !== null}
              <span class="text-[#14f195]" title={$wallet.address.toBase58()}>
                {shortAddr($wallet.address)}
              </span>
            {:else}
              <span class="text-white/40">{$t("submodal.notConnected")}</span>
            {/if}
          </dd>
        </div>
        {#if subPda !== null}
          <div class="hairline flex items-center justify-between gap-2 pt-2.5">
            <dt class="text-xs text-white/40">{$t("submodal.pdaLabel")}</dt>
            <dd class="font-mono text-[11px] text-[#7df4ff]" title={subPda.toBase58()}>
              {shortAddr(subPda)}
            </dd>
          </div>
        {/if}
      </dl>

      <!-- What you actually sign: the real atomic instruction pair. -->
      <div class="mb-4">
        <p
          class="mb-1.5 flex items-center justify-between gap-2 font-mono text-[11px] font-semibold tracking-[0.08em] text-white/45 uppercase"
        >
          <span>{$t("submodal.youSign")}</span>
          <span class="text-[#14f195]">Model B · 1 tx</span>
        </p>
        <div class="space-y-2 rounded-xl border border-white/10 bg-[#0c0e17] p-3 font-mono text-xs">
          <div class="flex items-start gap-2">
            <span class="shrink-0 font-bold text-[#d8b9ff]">ix 1</span>
            <div class="min-w-0">
              <p class="text-[#a0ffc3]">spl_token::approve</p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] break-all text-white/40">
                {$t("submodal.delegateTo")}
                <span class="text-white/70">{subPda === null ? "PDA" : shortAddr(subPda)}</span>
                <span>{$t("plan.allowanceNote")}</span>
              </p>
            </div>
          </div>
          <div class="flex items-start gap-2 border-t border-white/5 pt-2">
            <span class="shrink-0 font-bold text-[#00dbe9]">ix 2</span>
            <div class="min-w-0">
              <p class="text-[#a0ffc3]">program::subscribe</p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-1 text-[11px] break-all text-white/40">
                {$t("submodal.creates")}
                <span class="text-white/70">{subPda === null ? "PDA" : shortAddr(subPda)}</span>
                ·
                <span>{periodLabel}</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Cancel / revoke note (why this is safe to authorize). -->
      <div
        class="mb-5 flex items-start gap-2.5 rounded-xl border border-[rgba(20,241,149,0.25)] bg-[rgba(20,241,149,0.07)] p-3 text-xs text-[#a0ffc3]"
      >
        <span class="msym mt-0.5 shrink-0 text-[16px] text-[#14f195]" aria-hidden="true">shield</span>
        <p>{$t("submodal.cancelNote")}</p>
      </div>

      <!-- Actions: cancel stays; confirm hands over to the existing flow. -->
      <div class="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          class="btn-ghost flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-sm"
          onclick={() => onClose()}
        >
          {$t("submodal.cancel")}
        </button>
        <button
          type="button"
          class="btn-stitch flex-[2] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm"
          disabled={busy}
          onclick={() => onConfirm(plan)}
        >
          <span class="msym text-[18px]" aria-hidden="true">{busy ? "hourglass_top" : "key"}</span>
          {busy ? $t("plancard.signing") : $t("submodal.confirm")}
        </button>
      </div>
      {#if $wallet.address === null}
        <p class="mt-2 text-[11px] text-white/40">{$t("plancard.needWallet")}</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* Entry animation only — content is fully visible without JS or with
     reduced motion (animation: none below keeps the final frame). */
  .sm-backdrop {
    animation: sm-fade 0.2s ease-out;
  }
  .sm-pop {
    animation: sm-pop 0.2s ease-out;
  }
  @keyframes sm-fade {
    from {
      opacity: 0;
    }
  }
  @keyframes sm-pop {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.98);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sm-backdrop,
    .sm-pop {
      animation: none;
    }
  }
</style>
