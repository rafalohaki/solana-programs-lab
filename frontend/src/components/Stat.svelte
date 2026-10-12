<script lang="ts">
  import "../lib/i18n-port1.js";

  interface Props {
    value: string;
    /** Static-dictionary key for the top eyebrow, e.g. "stats.plansTop". */
    labelKey?: string;
    /** English fallback rendered inline for pre-paint; also the legacy path. */
    label?: string;
    /** Material Symbols glyph at the top-right (skipped when `live` chip shows). */
    icon?: string;
    /** Optional msym glyph rendered before the value text (replaces inline emoji). */
    valueIcon?: string;
    /** Accent of value + sub + corner blur: mint | cyan | grape | white. */
    tone?: "mint" | "cyan" | "grape" | "white";
    /** Colored one-liner under the value (mono). */
    subKey?: string;
    sub?: string;
    /** Bottom caption above the hairline (mono, uppercase). */
    hintKey?: string;
    hint?: string;
    /** Material glyph prefixed to the bottom caption. */
    captionIcon?: string;
    /** Show the emerald LIVE pill (truthful only for RPC-streamed figures). */
    live?: boolean;
    /** Optional DOM id on the value node (demo-mode overrides, tests). */
    id?: string;
  }

  let { value, labelKey, label, icon, valueIcon, tone = "white", subKey, sub, hintKey, hint, captionIcon, live = false, id }: Props = $props();

  const TONES: Record<string, { text: string }> = {
    mint: { text: "text-[#14f195]" },
    cyan: { text: "text-[#00dbe9]" },
    grape: { text: "text-[#d8b9ff]" },
    white: { text: "text-white" },
  };

  const tones = $derived(TONES[tone] ?? TONES.white);
</script>

<div class="glass card-hover relative flex h-full flex-col overflow-hidden rounded-xl p-5">
  <div class="mb-3 flex min-h-[22px] items-center justify-between gap-2">
    {#if labelKey !== undefined}
      <p class="eyebrow min-w-0 text-white/60"><span data-i18n={labelKey}>{label ?? labelKey}</span></p>
    {:else}
      <p class="eyebrow min-w-0 text-white/60">{label ?? ""}</p>
    {/if}
    {#if live}
      <span class="chip-active shrink-0"><span data-i18n="home1.live">LIVE</span></span>
    {:else if icon !== undefined}
      <span class={`msym shrink-0 text-[18px] ${tones.text}`} aria-hidden="true">{icon}</span>
    {/if}
  </div>
  <p
    {id}
    class={`tnum font-display mb-1 max-w-full text-[clamp(1.5rem,6vw,1.875rem)] leading-9 font-bold break-words tracking-tight ${tones.text} ${valueIcon !== undefined ? "flex items-center gap-1.5" : ""}`}
  >
    {#if valueIcon !== undefined}<span class="msym text-[26px]" aria-hidden="true">{valueIcon}</span>{/if}
    {value}
  </p>
  {#if subKey !== undefined}
    <p class={`tnum mb-2 font-mono text-sm ${tone === "white" ? "text-white/90" : tones.text}`}>
      <span data-i18n={subKey}>{sub ?? subKey}</span>
    </p>
  {:else if sub}
    <p class={`tnum mb-2 font-mono text-sm ${tone === "white" ? "text-white/90" : tones.text}`}>{sub}</p>
  {/if}
  {#if hintKey !== undefined || hint}
    <p class="hairline mt-auto flex w-full items-center gap-1.5 pt-2.5 font-mono text-[11px] tracking-[0.06em] text-white/60 uppercase">
      {#if captionIcon !== undefined}<span class="msym text-[14px]" aria-hidden="true">{captionIcon}</span>{/if}
      {#if hintKey !== undefined}
        <span class="min-w-0" data-i18n={hintKey}>{hint ?? hintKey}</span>
      {:else if hint}
        {hint}
      {/if}
    </p>
  {/if}
</div>
