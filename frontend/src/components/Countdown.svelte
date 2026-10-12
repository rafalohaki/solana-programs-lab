<script lang="ts">
  import { applyStaticLang, getLang, lang, t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import { tick } from "svelte";

  interface Props {
    targetUnix: number;
    /** "lg" renders the Stitch-style hero countdown for subscription cards. */
    size?: "sm" | "lg";
    /** Real period length in seconds (from the on-chain plan) — enables the progress ring. */
    periodSeconds?: number;
  }

  let { targetUnix, size = "sm", periodSeconds }: Props = $props();
  let now = $state(Math.floor(Date.now() / 1000));

  $effect(() => {
    const id = window.setInterval(() => {
      now = Math.floor(Date.now() / 1000);
    }, 1000);
    return () => window.clearInterval(id);
  });

  const remaining = $derived(Math.max(0, targetUnix - now));
  const parts = $derived({
    d: Math.floor(remaining / 86400),
    h: Math.floor((remaining % 86400) / 3600),
    m: Math.floor((remaining % 3600) / 60),
    s: remaining % 60,
  });
  const pad = (n: number): string => n.toString().padStart(2, "0");
  /**
   * Elapsed share of the billing period, 0..100 — drives the SVG ring in "lg".
   * Only rendered when a real on-chain period is passed in; never a fake 82%.
   */
  const ringPct = $derived(
    periodSeconds !== undefined && periodSeconds > 0
      ? Math.min(100, Math.max(0, 100 * (1 - remaining / periodSeconds)))
      : null,
  );
  const locale = $derived($lang === "pl" ? "pl-PL" : "en-US");
  const dateTitle = $derived(new Date(targetUnix * 1000).toLocaleString(locale));
  const ariaLabel = $derived(
    `${parts.d}${$t("countdown.d")} ${pad(parts.h)}${$t("countdown.h")} ${pad(parts.m)}${$t("countdown.m")} ${pad(parts.s)}${$t("countdown.s")}`,
  );

  const isDue = $derived(remaining === 0);
  // The "payment due" chip mounts only when the timer clamps to zero — long
  // after the last dictionary pass — so re-apply static translations when
  // the branch flips (or the language changes). Ticks never re-trigger this:
  // only the boolean, size and lang are tracked.
  $effect(() => {
    void isDue;
    void size;
    $lang;
    void tick().then(() => applyStaticLang(getLang()));
  });
</script>

{#if remaining === 0}
  <!-- Past due is a coral semantic state per DESIGN.md — .chip-pastdue, never emerald. -->
  <span class="chip-pastdue" title={dateTitle}>
    <span data-i18n="countdown.due">payment due</span>
  </span>
{:else if size === "lg"}
  <span class="inline-flex items-center gap-3">
    <span class="font-mono text-[clamp(1.25rem,5.5vw,1.75rem)] font-bold tracking-tight text-white tabular-nums sm:text-3xl" title={dateTitle} role="timer" aria-label={ariaLabel}>
      {#if parts.d > 0}<b class="text-[#7df4ff]">{parts.d}</b><span class="text-sm font-medium text-white/50">{$t("countdown.d")} </span>{/if}<b>{pad(parts.h)}</b><span class="text-white/40">:</span><b>{pad(parts.m)}</b><span class="text-white/40">:</span><b class="text-[#7df4ff]">{pad(parts.s)}</b>
    </span>
    {#if ringPct !== null}
      <!-- Stitch miniature circular timer (pattern code.html:108-111), fed with real elapsed share. -->
      <svg class="h-9 w-9 shrink-0 -rotate-90 text-[#9945ff]" viewBox="0 0 36 36" aria-hidden="true">
        <path class="text-white/10" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
        <path
          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
          fill="none"
          stroke="currentColor"
          stroke-dasharray="{ringPct}, 100"
          stroke-linecap="round"
          stroke-width="3.5"></path>
      </svg>
    {/if}
  </span>
{:else}
  <span class="font-mono text-xs text-white/70" title={dateTitle} role="timer" aria-label={ariaLabel}>
    {#if parts.d > 0}<b class="text-white">{parts.d}</b>{$t("countdown.d")} {/if}<b class="text-white">{pad(parts.h)}</b>:<b
      class="text-white">{pad(parts.m)}</b
    >:<b class="text-white">{pad(parts.s)}</b>
  </span>
{/if}
