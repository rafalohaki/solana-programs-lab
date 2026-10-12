<script lang="ts">
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-proofs.js";
  import "../lib/i18n-port1.js";
  import "../lib/i18n-home2.js";

  // Control-plane rail: one enforced track — single purple accent throughout.
  // Copy untouched — every string below stays on its existing astrip.* key.
  const cards = [
    { t: "astrip.f1t", b: "astrip.f1b", icon: "lock", accent: "rgba(153,69,255,0.7)" },
    { t: "astrip.f2t", b: "astrip.f2b", icon: "domain", accent: "rgba(153,69,255,0.7)" },
    { t: "astrip.f3t", b: "astrip.f3b", icon: "power_settings_new", accent: "rgba(153,69,255,0.7)" },
  ];
</script>

<section class="py-12" aria-labelledby="astrip-title" id="agents">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <p class="eyebrow text-white/40">{$t("astrip.eyebrow")}</p>
    <span class="tnum rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 mono-label text-white/40" data-i18n="home2.agentNote">3 mechanisms · 0 promises</span>
  </div>
  <h2 id="astrip-title" class="font-display mt-1 text-xl font-bold tracking-tight sm:text-2xl">
    {$t("astrip.title")}
  </h2>
  <p class="mt-1 max-w-2xl text-sm text-white/55">{$t("astrip.lead")}</p>

  <!-- Control-plane timeline: one enforced track, three hard stops.
       Horizontal on sm+, vertical rail on mobile. -->
  <div class="relative mt-5">
    <div class="absolute top-1 bottom-1 left-1 w-px bg-white/10 sm:top-1 sm:right-1 sm:bottom-auto sm:left-1 sm:h-px sm:w-auto" aria-hidden="true"></div>
    <ol class="relative grid list-none gap-4 p-0 sm:grid-cols-3">
      {#each cards as card, i (card.t)}
        <li class={`relative rounded-xl pl-6 sm:pl-0 sm:pt-6 ${i === 0 ? "ring-1 ring-white/10" : ""}`}>
          <span class="absolute top-1.5 left-0 h-2 w-2 rounded-full bg-[#9945ff] sm:top-0 sm:left-0" aria-hidden="true"></span>
          <div class="flex items-center gap-2">
            <span class="msym text-[20px]" style={`color: ${card.accent}`} aria-hidden="true">{card.icon}</span>
            <h3 class="text-[14px] font-semibold text-white/90">{$t(card.t)}</h3>
          </div>
          <p class="mt-1 text-[13px] leading-relaxed text-white/55 sm:line-clamp-2">{$t(card.b)}</p>
          {#if i === 2}
            <a href="/manage" class="btn-secondary mt-4 inline-block px-4 py-2 text-[13px]">{$t("astrip.cta")}</a>
          {/if}
        </li>
      {/each}
    </ol>
  </div>
</section>

