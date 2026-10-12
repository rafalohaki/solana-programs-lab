<script lang="ts">
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-proofs.js";
  import "../lib/i18n-port1.js";
  import "../lib/i18n-home2.js";
  interface Faq {
    q: string;
    a: string;
    tag: string;
    ev: string;
  }

  const faqs: Faq[] = [
    { q: "jfaq.q1", a: "jfaq.a1", tag: "home2.jtag1", ev: "jfaq.ev1" },
    { q: "jfaq.q2", a: "jfaq.a2", tag: "home2.jtag2", ev: "jfaq.ev2" },
    { q: "jfaq.q3", a: "jfaq.a3", tag: "home2.jtag3", ev: "jfaq.ev3" },
    { q: "jfaq.q4", a: "jfaq.a4", tag: "home2.jtag4", ev: "jfaq.ev4" },
  ];
</script>

<section class="py-12" id="judges-faq" aria-labelledby="jfaq-title">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <p class="eyebrow text-white/40">{$t("jfaq.eyebrow")}</p>
    <span class="tnum mono-label flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-white/40">
      <span class="msym text-[14px]" aria-hidden="true">gavel</span>{$t("jfaq.docket")}
    </span>
  </div>
  <h2 id="jfaq-title" class="font-display mt-1 text-xl font-bold tracking-tight sm:text-2xl">{$t("jfaq.title")}</h2>
  <p class="mt-1 max-w-2xl text-sm text-white/55">{$t("jfaq.lead")}</p>

  <!-- Judge's docket: numbered cases, each ruling backed by mono evidence. -->
  <ol class="mt-5 max-w-3xl list-none p-0">
    {#each faqs as faq, i (faq.q)}
      <li class="border-b border-white/[0.06] last:border-b-0">
        <details class="group py-4 sm:py-5" open={i === 0}>
          <summary class="flex cursor-pointer list-none items-center gap-3 text-sm font-semibold text-white/90 sm:gap-4 [&::-webkit-details-marker]:hidden">
            <span class="tnum font-display flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg bg-white/[0.05] leading-none" aria-hidden="true">
              <span class="text-[15px] font-bold text-[#d8b9ff]">0{i + 1}</span>
              <span class="mt-0.5 font-mono text-[8px] tracking-[0.1em] text-white/30">CASE</span>
            </span>
            <span class="flex-1">{ $t(faq.q) }</span>
            <span class="msym shrink-0 text-[20px] text-white/35 transition-transform duration-200 group-open:rotate-180 group-hover:text-white/70" aria-hidden="true">expand_more</span>
          </summary>
          <p class="hairline mt-3 max-w-prose pt-3 pl-0 text-[13px] leading-relaxed text-white/60 min-[480px]:pl-14">{$t(faq.a)}</p>
          <div class="mt-3 flex flex-wrap items-center gap-2 pl-0 min-[480px]:pl-14">
            <span class="mono-label rounded-full border border-emerald-400/25 bg-emerald-400/[0.07] px-2.5 py-1 text-emerald-300/80">{$t(faq.tag)}</span>
            <code class="mono-label rounded-lg bg-black/40 px-2 py-1 font-mono text-[11px] text-[#7df4ff]/90">{$t(faq.ev)}</code>
            {#if i === 1}
              <a href="/manage" class="mono-label rounded-full border border-white/10 px-3 py-1.5 text-white/60 underline decoration-dotted underline-offset-2 transition-colors hover:border-cyan-300/40 hover:text-[#7df4ff] hover:decoration-solid sm:px-2.5 sm:py-1">{$t("jfaq.evLink")} →</a>
            {/if}
          </div>
        </details>
      </li>
    {/each}
  </ol>
</section>
