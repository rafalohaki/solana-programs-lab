<script lang="ts">
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-proofs.js";

  // Live-truth: a cell never renders blank — an empty translation falls back
  // to a muted dash, never a mock number.
  const orDash = (v: string): string => (v != null && v.trim() !== "" ? v : "–");
  import "../lib/i18n-port1.js";

  interface Row {
    label: string;
    icon: string;
    us: [string, string];
    stripe: [string, string];
    tradfi: [string, string];
  }

  const rows: Row[] = [
    {
      label: "cmp.rowFee",
      icon: "payments",
      us: ["cmp.feeUs", "cmp.feeUsNote"],
      stripe: ["cmp.feeStripe", "cmp.feeStripeNote"],
      tradfi: ["cmp.feeTradfi", "cmp.feeTradfiNote"],
    },
    {
      label: "cmp.rowFinality",
      icon: "bolt",
      us: ["cmp.finUs", "cmp.finUsNote"],
      stripe: ["cmp.finStripe", "cmp.finStripeNote"],
      tradfi: ["cmp.finTradfi", "cmp.finTradfiNote"],
    },
    {
      label: "cmp.rowCb",
      icon: "shield",
      us: ["cmp.cbUs", "cmp.cbUsNote"],
      stripe: ["cmp.cbStripe", "cmp.cbStripeNote"],
      tradfi: ["cmp.cbTradfi", "cmp.cbTradfiNote"],
    },
    {
      label: "cmp.rowCustody",
      icon: "lock",
      us: ["cmp.custodyUs", "cmp.custodyUsNote"],
      stripe: ["cmp.custodyStripe", "cmp.custodyStripeNote"],
      tradfi: ["cmp.custodyTradfi", "cmp.custodyTradfiNote"],
    },
  ];
</script>

<section class="py-12" aria-labelledby="cmp-title" id="benchmark">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <p class="eyebrow text-white/40">{$t("cmp.eyebrow")}</p>
    <span class="tnum mono-label rounded-full border border-dashed border-white/15 bg-white/[0.03] px-2.5 py-1 text-white/40">{$t("cmp.receiptTag")}</span>
  </div>
  <h2 id="cmp-title" class="font-display mt-1 text-xl font-bold tracking-tight sm:text-2xl">{$t("cmp.title")}</h2>
  <p class="mt-1 max-w-2xl text-sm text-white/55">{$t("cmp.lead")}</p>

  <!-- Receipt shell: subtle perforated stub on top, table scrolls horizontally on mobile. -->
  <div class="glass relative mt-5 overflow-hidden">
    <div class="flex items-center gap-3 border-b border-dashed border-white/10 px-4 py-2" aria-hidden="true">
      <span class="msym text-[16px] text-white/30">receipt_long</span>
      <span class="flex-1 border-t border-dashed border-white/15"></span>
      <span class="msym text-[16px] text-white/30">receipt_long</span>
    </div>
    <div class="overflow-x-auto">
      <table class="table-void w-full min-w-[680px]">
        <thead>
          <tr class="bg-white/[0.02]">
            <th scope="col" class="text-[11px] font-medium uppercase tracking-wider text-white/40">{$t("cmp.colMetric")}</th>
            <th scope="col" class="bg-[#14f195]/[0.06] text-[11px] font-medium uppercase tracking-wider text-[#14f195]">
              <span class="msym mr-1 inline-block align-[-4px] text-[14px]" aria-hidden="true">bolt</span>
              {$t("cmp.colUs")}
            </th>
            <th scope="col" class="text-[11px] font-medium uppercase tracking-wider text-white/50">
              <span class="msym mr-1 inline-block align-[-4px] text-[14px] text-white/35" aria-hidden="true">credit_card</span>
              {$t("cmp.colStripe")}
            </th>
            <th scope="col" class="text-[11px] font-medium uppercase tracking-wider text-white/50">
              <span class="msym mr-1 inline-block align-[-4px] text-[14px] text-white/35" aria-hidden="true">account_balance</span>
              {$t("cmp.colTradfi")}
            </th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i (row.label)}
            {@const c = {
              usV: orDash($t(row.us[0])),
              usN: orDash($t(row.us[1])),
              stV: orDash($t(row.stripe[0])),
              stN: orDash($t(row.stripe[1])),
              trV: orDash($t(row.tradfi[0])),
              trN: orDash($t(row.tradfi[1])),
            }}
            <tr class="transition-colors hover:bg-white/[0.02]">
              <th scope="row" class="align-top text-[13px] font-semibold text-white/80">
                <span class="mb-1 flex items-center gap-2" aria-hidden="true">
                  <span class="tnum font-mono text-[10px] tracking-[0.08em] text-white/30">0{i + 1}</span>
                  <span class="msym text-[15px] text-white/35">{row.icon}</span>
                </span>
                {$t(row.label)}
              </th>
              <td class="bg-[#14f195]/[0.05] align-top shadow-[inset_2px_0_0_rgba(20,241,149,0.55)]">
                <p class={`tnum flex items-center gap-1.5 font-mono font-bold tabular-nums ${c.usV === "–" ? "text-white/30" : "text-[#14f195]"}`}>
                  {#if c.usV !== "–"}<span class="msym text-[15px]" aria-hidden="true">check_circle</span>{/if}{c.usV}
                </p>
                <p class={`mt-0.5 text-xs leading-relaxed ${c.usN === "–" ? "text-white/30" : "text-white/45"}`}>{c.usN}</p>
              </td>
              <td class="align-top">
                <p class={`tnum font-mono font-bold tabular-nums ${c.stV === "–" ? "text-white/30" : "text-white/60"}`}>{c.stV}</p>
                <p class={`mt-0.5 text-xs leading-relaxed ${c.stN === "–" ? "text-white/30" : "text-white/45"}`}>{c.stN}</p>
              </td>
              <td class="align-top">
                <p class={`tnum font-mono font-bold tabular-nums ${c.trV === "–" ? "text-white/30" : "text-white/60"}`}>{c.trV}</p>
                <p class={`mt-0.5 text-xs leading-relaxed ${c.trN === "–" ? "text-white/30" : "text-white/45"}`}>{c.trN}</p>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <div class="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#11131d]/90 to-transparent md:hidden" aria-hidden="true"></div>
  </div>

  <!-- Receipt total: the savings ruler. Formula published, figure yours. -->
  <div class="glass mt-4 rounded-xl p-5">
    <p class="flex items-center gap-2 text-sm font-semibold">
      <span class="msym text-[18px] text-[#14f195]" aria-hidden="true">calculate</span>
      {$t("cmp.saveTitle")}
    </p>
    <p class="mt-1 max-w-2xl text-[13px] leading-relaxed text-white/55">{$t("cmp.saveBody")}</p>
    <p class="codeblock tnum mt-3 inline-block">{$t("cmp.saveFormula")}</p>
    <p class="mono-label mt-2 text-[11px] text-white/50">{$t("cmp.saveHint")}</p>
  </div>
</section>
