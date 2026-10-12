<script lang="ts">
  import "../lib/i18n-fee.js";
  import {
    FEE_BPS,
    feeFor,
    formatTokenAmount,
    shortTreasury,
  } from "../lib/fee.js";

  interface Props {
    /** Charge amount in base units — drives the computed fee figure. */
    amount: bigint | number;
    /** Mint decimals; when set, the badge shows the concrete fee value. */
    decimals?: number;
    /** Token symbol shown next to the concrete fee (e.g. "USDC"). */
    symbol?: string;
    /** Basis-points override (default 40 = 0,4%). */
    bps?: number;
  }

  let { amount, decimals, symbol, bps = FEE_BPS }: Props = $props();

  const fee = $derived(feeFor(amount, bps));
  const tail = shortTreasury();
  const concrete = $derived(
    decimals === undefined
      ? null
      : `${formatTokenAmount(fee, decimals)}${symbol ? ` ${symbol}` : ""}`,
  );
</script>

<!--
  Protocol-fee badge (unconnected island fragment — the parent island wires
  `amount` / `decimals` / `symbol` from live plan data and places this next
  to the charge CTA). Static words carry EN inline + data-i18n (each span is
  fully static so applyStaticLang never clobbers the dynamic fee figure);
  the figure itself intentionally has no data-i18n key. Live mode shows the
  on-chain-computed fee; demo mode is the parent's call (pass demo amounts).
-->
<span
  class="tnum inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full border border-white/10 bg-[#191b25]/80 px-2.5 py-1 font-mono text-[11px] font-medium tracking-[0.06em] text-[#cec2d8]"
  data-i18n-title="fee.hint"
  title="0.4% of every charge settles to the protocol treasury"
>
  <span data-i18n="fee.label">0.4% protocol fee</span>
  {#if concrete !== null}
    <span class="text-[#e1e1f0]">· {concrete}</span>
  {/if}
  <span aria-hidden="true" class="text-[#9945ff]">→</span>
  <span data-i18n="fee.treasury">treasury</span>
  <span class="text-white/40">{tail}</span>
</span>
