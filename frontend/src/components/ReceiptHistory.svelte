<script module lang="ts">
  // ---------------------------------------------------------------------------
  // Device-local receipt store. There is no per-wallet aggregation endpoint
  // (GET /api/invoices/charges needs an invoice id), so every charge that
  // confirms in THIS browser is appended to localStorage. Honest by design:
  // the UI always labels the list "This device".
  // ---------------------------------------------------------------------------

  export interface LocalReceipt {
    signature: string;
    /** Human label, e.g. "plan #3". Never a server id — plain local text. */
    label: string;
    amountRaw: string;
    decimals: number;
    /** ms epoch, Date.now() at confirm time. */
    ts: number;
    /** Base58 wallet that saw the confirmation. */
    wallet: string;
  }

  const STORAGE_KEY = "solhack:receipts:v1";
  const EVENT_NAME = "solhack:receipt";

  /** Event name for cross-island receipt updates (ManagePanel writes, this list re-reads). */
  export function receiptEventName(): string {
    return EVENT_NAME;
  }

  function isReceipt(value: unknown): value is LocalReceipt {
    if (typeof value !== "object" || value === null) return false;
    const r = value as Record<string, unknown>;
    return (
      typeof r["signature"] === "string" &&
      typeof r["label"] === "string" &&
      typeof r["amountRaw"] === "string" &&
      typeof r["decimals"] === "number" &&
      typeof r["ts"] === "number" &&
      typeof r["wallet"] === "string"
    );
  }

  export function loadLocalReceipts(): LocalReceipt[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isReceipt).slice(0, 200);
    } catch {
      return [];
    }
  }

  export function recordLocalReceipt(entry: LocalReceipt): void {
    if (typeof localStorage === "undefined") return;
    const next = [entry, ...loadLocalReceipts()].slice(0, 200);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota / private mode — the receipt is simply not persisted.
    }
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }

  export function clearLocalReceipts(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* best effort */
    }
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }
</script>

<script lang="ts">
  import EmptyState from "./art/EmptyState.svelte";
  import { Connection } from "@solana/web3.js";
  import { connection, explorerTxUrl, formatTokenAmount } from "../lib/chain.js";
  import { applyStaticLang, getLang, lang, t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-port3.js";
  import "../lib/i18n-manage2.js";
  import { copyText } from "../lib/ui.js";
  import { wallet } from "../lib/wallet.js";
  import { DEMO_RECEIPTS, isDemoMode } from "../lib/demo.js";
  import { onMount, tick, untrack } from "svelte";

  /** Demo mode (parent contract): DEMO_RECEIPTS instead of any read. */
  const demo = typeof window !== "undefined" && isDemoMode();

  type ReceiptStatus = "pending" | "confirmed" | "finalized" | "failed" | "unknown";

  /** Status + the on-chain slot when getSignatureStatuses reports one (keeps "date & slot" honest). */
  interface ReceiptState {
    status: ReceiptStatus;
    slot?: number;
  }

  let receipts: LocalReceipt[] = $state([]);
  let statuses: Record<string, ReceiptState> = $state({});
  let query = $state("");
  // Time-period filter (honest: LocalReceipt carries a confirm timestamp).
  type Period = "all" | "24h" | "7d" | "30d";
  let period = $state<Period>("all");
  const PERIODS: { id: Period; labelKey: string; label: string; ms: number | null }[] = [
    { id: "all", labelKey: "receipt.periodAll", label: "All time", ms: null },
    { id: "24h", labelKey: "receipt.period24h", label: "Last 24h", ms: 86_400_000 },
    { id: "7d", labelKey: "receipt.period7d", label: "Last 7d", ms: 604_800_000 },
    { id: "30d", labelKey: "receipt.period30d", label: "Last 30d", ms: 2_592_000_000 },
  ];

  const mine = $derived(
    $wallet.address === null ? receipts : receipts.filter((r) => r.wallet === $wallet.address?.toBase58()),
  );
  const dateLocale = $derived($lang === "pl" ? "pl-PL" : "en-US");

  /** Client-side search over data already fetched — service label + tx signature. */
  function receiptMatches(label: string, sig: string): boolean {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    return label.toLowerCase().includes(q) || sig.toLowerCase().includes(q);
  }
  const filteredDemo = $derived(DEMO_RECEIPTS.filter((d) => receiptMatches(d.service, d.signature)));
  const filteredMine = $derived(
    mine.filter((r) => {
      if (!receiptMatches(r.label, r.signature)) return false;
      const chosen = PERIODS.find((p) => p.id === period);
      if (chosen !== undefined && chosen.ms !== null && Date.now() - r.ts > chosen.ms) return false;
      return true;
    }),
  );
  // "{count}" in receipt.noMatch is the TOTAL list size, not the filtered one —
  // the whole point of the hint is how many rows the search box is hiding.
  const noMatchLabel = $derived(
    $t("receipt.noMatch").replace("{count}", String(demo ? DEMO_RECEIPTS.length : mine.length)),
  );

  function shortSig(sig: string): string {
    return sig.length <= 12 ? sig : `${sig.slice(0, 5)}…${sig.slice(-5)}`;
  }

  /** Stable device-local receipt id derived from the signature (no server ids exist). */
  function receiptId(sig: string): string {
    const alnum = sig.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase();
    return `RCPT-${alnum}`;
  }

  function walletShort(addr: string): string {
    return addr.length <= 9 ? addr : `${addr.slice(0, 4)}…${addr.slice(-4)}`;
  }
  function statusKey(s: ReceiptStatus): string {
    switch (s) {
      case "confirmed":
        return "receipt.stConfirmed";
      case "finalized":
        return "receipt.stFinalized";
      case "pending":
        return "receipt.stPending";
      case "failed":
        return "receipt.stFailed";
      case "unknown":
        return "receipt.stUnknown";
    }
  }

  // Monotonic sequence: a newer pass (wallet change, new receipt) supersedes
  // an in-flight one, so a signature that lands mid-fetch is picked up by
  // the newer pass instead of waiting for an arbitrary next trigger.
  let statusSeq = 0;

  /**
   * Resolve on-chain statuses for the given signatures. The caller passes
   * them explicitly: the calling $effect tracks wallet + receipts only,
   * while `statuses` is read through untrack, so writing it below can never
   * re-trigger that effect.
   */
  async function refreshStatuses(sigs: string[]): Promise<void> {
    const seq = ++statusSeq;
    const missing = untrack(() => sigs.filter((sig) => statuses[sig] === undefined));
    if (missing.length === 0) return;
    try {
      const conn: Connection = connection();
      // getSignatureStatuses caps the batch; 32 per call keeps it cheap.
      for (let i = 0; i < missing.length; i += 32) {
        const batch = missing.slice(i, i + 32);
        const { value } = await conn.getSignatureStatuses(batch, { searchTransactionHistory: true });
        // Superseded: a newer pass owns the writes from here on.
        if (seq !== statusSeq) return;
        for (let j = 0; j < batch.length; j++) {
          const sig = batch[j];
          if (sig === undefined) continue;
          const st = value[j];
          if (st === null || st === undefined) {
            statuses[sig] = { status: "unknown" };
          } else if (st.err !== null && st.err !== undefined) {
            statuses[sig] = { status: "failed", slot: st.slot ?? undefined };
          } else if (st.confirmationStatus === "finalized") {
            statuses[sig] = { status: "finalized", slot: st.slot ?? undefined };
          } else if (st.confirmationStatus === "confirmed") {
            statuses[sig] = { status: "confirmed", slot: st.slot ?? undefined };
          } else {
            statuses[sig] = { status: "pending", slot: st.slot ?? undefined };
          }
        }
      }
    } catch {
      if (seq !== statusSeq) return;
      for (const sig of missing) {
        if (statuses[sig] === undefined) statuses[sig] = { status: "unknown" };
      }
    }
  }

  function reload(): void {
    // DEMO MODE: fixtures instead of any read; no RPC status checks.
    if (demo) return;
    // Reassigning `receipts` re-runs the status effect below (its dependency)
    // — no explicit refreshStatuses call here, or mount would fetch twice.
    receipts = loadLocalReceipts();
  }

  onMount(() => {
    reload();
    const onEvent = (): void => reload();
    window.addEventListener(receiptEventName(), onEvent);
    window.addEventListener("storage", onEvent);
    return () => {
      window.removeEventListener(receiptEventName(), onEvent);
      window.removeEventListener("storage", onEvent);
    };
  });

  // Re-resolve when the wallet (dis)connects or a new receipt lands. The
  // dependencies are exactly the synchronous `mine` read below; refreshStatuses
  // reads/writes statuses untracked so they never re-trigger this effect.
  $effect(() => {
    if (demo) return;
    const sigs = mine.map((r) => r.signature);
    void refreshStatuses(sigs);
  });

  // This island hydrates on idle — after every dictionary-driven
  // applyStaticLang pass — so re-apply static translations whenever the
  // rendered branch or row set changes. Idempotent; missing keys keep EN.
  $effect(() => {
    mine.length;
    filteredMine.length;
    filteredDemo.length;
    query;
    period;
    $lang;
    void tick().then(() => applyStaticLang(getLang()));
  });
</script>

<section class="mt-10" aria-label="receipt history" data-i18n-aria="receipt.title">
  <div class="flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 class="font-display text-xl font-bold tracking-tight sm:text-2xl" data-i18n="receipt.title">
        Charge history &amp; on-chain receipts
      </h2>
      <p class="mt-1 max-w-2xl text-sm leading-relaxed text-white/55">
        <span data-i18n="receipt.lead"
          >Every row below was saved in this browser when a charge confirmed here. This is not a global index.</span
        >
        {#if !demo}
          <span
            class="ml-2 inline-flex items-center rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/60"
            data-i18n="receipt.thisDevice">This device</span
          >
        {/if}
      </p>
    </div>
    <div class="flex items-center gap-3">
      <span class="font-mono text-[11px] text-white/40 tabular-nums">{demo ? DEMO_RECEIPTS.length : mine.length} {$t("receipt.count")}</span>
      {#if !demo && mine.length > 0}
        <button
          class="btn-ghost cursor-pointer px-3 py-1.5 text-xs"
          onclick={() => clearLocalReceipts()}
          data-i18n="receipt.clear">Clear device history</button
        >
      {/if}
    </div>
  </div>

  {#if demo || mine.length > 0}
    <!-- Stitch history filter bar (pattern code.html:325), scoped honestly: search only —
         LocalReceipt carries no mint field, so mint chips would be fake. -->
    <div class="glass mt-4 flex items-center gap-2 rounded-xl p-3">
      <span class="msym shrink-0 text-[18px] text-white/40" aria-hidden="true">search</span>
      <input
        class="field w-full min-w-0 flex-1 px-3 py-1.5 font-mono text-xs text-white"
        type="search"
        placeholder={$t("receipt.searchPh")}
        bind:value={query}
      />
    </div>
  {/if}

  {#if demo}
    <!-- DEMO MODE: parent-owned DEMO_RECEIPTS fixtures, no links (truncated sigs), no RPC. -->
    <div class="glass mt-4 overflow-x-auto rounded-2xl">
      <table class="table-stack w-full min-w-[560px] max-md:min-w-0 text-left text-sm">
        <thead>
          <tr class="border-b border-white/[0.06] font-mono text-[11px] tracking-[0.06em] text-white/40 uppercase">
            <th class="px-4 py-3" data-i18n="port3.colId">receipt ID</th>
            <th class="px-4 py-3" data-i18n="receipt.colService">service</th>
            <th class="px-4 py-3" data-i18n="receipt.colAmount">amount</th>
            <th class="px-4 py-3" data-i18n="port3.colDateSlot">date &amp; slot</th>
            <th class="px-4 py-3" data-i18n="receipt.colTx">tx signature</th>
            <th class="px-4 py-3 text-right" data-i18n="port3.colExplorer">explorer</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredDemo as d (d.id)}
            <tr class="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
              <td class="px-4 py-3" data-label={$t("port3.colId")}>
                <p class="font-mono text-xs font-semibold text-[#14f195]">{d.id}</p>
                <!-- Same chip family as the live table / InvoicesPanel "paid" state. -->
                <span class="chip-active mt-0.5">{$t("receipt.stConfirmed")}</span>
              </td>
              <td class="px-4 py-3 font-medium text-white/85" data-label={$t("receipt.colService")}>{d.service}</td>
              <td class="px-4 py-3 font-mono text-[#14f195] tabular-nums" data-label={$t("receipt.colAmount")}>{d.amount}</td>
              <td class="px-4 py-3 font-mono text-xs text-white/55 tabular-nums" data-label={$t("port3.colDateSlot")}>{d.when}<br /><span class="text-white/35">{$t("receipt.slot")} {d.slot}</span></td>
              <td class="px-4 py-3 font-mono text-xs text-white/55" data-label={$t("receipt.colTx")}>{d.signature}</td>
              <td class="px-4 py-3 text-right font-mono text-xs text-white/30" data-label={$t("port3.colExplorer")}>—</td>
            </tr>
          {:else}
            <tr>
              <td class="px-4 py-6 text-center text-sm text-white/45" colspan="6"><span class="msym mb-1 block text-[20px] text-white/30" aria-hidden="true">search</span>{noMatchLabel}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if mine.length === 0}
    <!-- Empty state still teaches the section layout: search chrome + the real
         table with its headers, with the empty explanation inside the body.
         No mint filter chips — LocalReceipt carries no mint field (see the
         demo-bar comment above), so fake filters stay out. -->
    <div class="glass mt-4 flex flex-wrap items-center gap-2 rounded-xl p-3">
      <span class="msym shrink-0 text-[18px] text-white/40" aria-hidden="true">search</span>
      <input
        class="field w-full min-w-0 flex-1 px-3 py-1.5 font-mono text-xs text-white"
        type="search"
        placeholder={$t("receipt.searchPh")}
        bind:value={query}
        disabled
      />
      <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={$t("receipt.periodLabel")}>
        {#each PERIODS as p (p.id)}
          <button
            type="button"
            class="tag-pill cursor-pointer"
            class:tag-pill--cyan={period === p.id}
            aria-pressed={period === p.id}
            onclick={() => (period = p.id)}
          >
            {$t(p.labelKey) !== p.labelKey ? $t(p.labelKey) : p.label}
          </button>
        {/each}
      </div>
    </div>
    <div class="glass mt-4 overflow-x-auto rounded-2xl">
      <table class="table-stack w-full min-w-[560px] max-md:min-w-0 text-left text-sm">
        <thead>
          <tr class="border-b border-white/[0.06] font-mono text-[11px] tracking-[0.06em] text-white/40 uppercase">
            <th class="px-4 py-3" data-i18n="port3.colId">receipt ID</th>
            <th class="px-4 py-3" data-i18n="receipt.colService">service</th>
            <th class="px-4 py-3" data-i18n="receipt.colAmount">amount</th>
            <th class="px-4 py-3" data-i18n="port3.colDateSlot">date &amp; slot</th>
            <th class="px-4 py-3" data-i18n="receipt.colTx">tx signature</th>
            <th class="px-4 py-3 text-right" data-i18n="port3.colExplorer">explorer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="px-4 py-8 text-center text-sm text-white/55" colspan="6">
              <EmptyState variant="receipts" class="mb-4" />
              <p data-i18n="receipt.empty">
                No receipts on this device yet. Charge a subscription and the receipt appears here.
              </p>
              <p class="mt-1 font-mono text-[11px] text-white/35" data-i18n="receipt.deviceNote">
                Saved in this browser's localStorage when a charge confirms here — switch device and the list is empty.
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  {:else}
    <div class="glass mt-4 overflow-x-auto rounded-2xl">
      <table class="table-stack w-full min-w-[560px] max-md:min-w-0 text-left text-sm">
        <thead>
          <tr class="border-b border-white/[0.06] font-mono text-[11px] tracking-[0.06em] text-white/40 uppercase">
            <th class="px-4 py-3" data-i18n="port3.colId">receipt ID</th>
            <th class="px-4 py-3" data-i18n="receipt.colService">service</th>
            <th class="px-4 py-3" data-i18n="receipt.colAmount">amount</th>
            <th class="px-4 py-3" data-i18n="port3.colDateSlot">date &amp; slot</th>
            <th class="px-4 py-3" data-i18n="receipt.colTx">tx signature</th>
            <th class="px-4 py-3 text-right" data-i18n="port3.colExplorer">explorer</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredMine as r (r.signature)}
            {@const st = statuses[r.signature] ?? { status: "pending" as ReceiptStatus }}
            <tr class="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
              <td class="px-4 py-3" data-label={$t("port3.colId")}>
                <p class="font-mono text-xs font-semibold text-[#14f195]">{receiptId(r.signature)}</p>
                {#if st.status === "failed"}
                  <span class="chip-pastdue mt-0.5">{$t("receipt.stFailed")}</span>
                {:else if st.status === "unknown"}
                  <!-- Neutral variant: .tag-pill colors are fixed in global.css (unlayered
                       CSS beats utility layers), so the muted tones go inline. -->
                  <span
                    class="tag-pill mt-0.5"
                    style="border-color: rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: rgba(225, 225, 240, 0.5);"
                  >
                    {$t("receipt.stUnknown")}
                  </span>
                {:else}
                  <span class="chip-active mt-0.5">{$t(statusKey(st.status))}</span>
                {/if}
              </td>
              <td class="px-4 py-3 font-medium text-white/85" data-label={$t("receipt.colService")}>{r.label}</td>
              <td class="px-4 py-3 font-mono text-[#14f195] tabular-nums" data-label={$t("receipt.colAmount")}>
                {formatTokenAmount(BigInt(r.amountRaw), r.decimals)}
              </td>
              <td class="px-4 py-3 font-mono text-xs text-white/55 tabular-nums" data-label={$t("port3.colDateSlot")}>
                {new Date(r.ts).toLocaleString(dateLocale)}<br />
                {#if st.slot !== undefined}
                  <!-- Real slot from getSignatureStatuses — makes the "date & slot" header true. -->
                  <span class="text-white/35">{$t("receipt.slot")} {st.slot.toLocaleString(dateLocale)}</span>
                {:else}
                  <span class="text-white/35" title={r.wallet}>{$t("port3.seenBy")} {walletShort(r.wallet)}</span>
                {/if}
              </td>
              <td class="px-4 py-3 font-mono text-xs text-white/55" data-label={$t("receipt.colTx")}>
                <span class="inline-flex items-center gap-1.5">
                  <span>{shortSig(r.signature)}</span>
                  <button
                    class="msym cursor-pointer text-[14px] text-white/40 transition-colors hover:text-[#14f195]"
                    title={$t("receipt.colTx")}
                    aria-label={$t("receipt.copyTx")}
                    onclick={() => void copyText(r.signature, $t("receipt.colTx"))}>content_copy</button
                  >
                </span>
              </td>
              <td class="px-4 py-3 text-right" data-label={$t("port3.colExplorer")}>
                <a
                  class="font-mono text-xs text-[#7df4ff] underline decoration-[#7df4ff]/30 underline-offset-2 transition-colors hover:text-[#00f0ff] hover:underline"
                  href={explorerTxUrl(r.signature)}
                  target="_blank"
                  rel="noreferrer"><span data-i18n="port3.explorerLink">Explorer</span> ↗</a
                >
              </td>
            </tr>
          {:else}
            <tr>
              <td class="px-4 py-6 text-center text-sm text-white/45" colspan="6"><span class="msym mb-1 block text-[20px] text-white/30" aria-hidden="true">search</span>{noMatchLabel}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
  </section>
