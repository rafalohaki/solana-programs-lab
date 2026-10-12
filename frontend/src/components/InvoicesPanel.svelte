<script lang="ts">
  import { PublicKey } from "@solana/web3.js";
  import { getAssociatedTokenAddressSync } from "@solana/spl-token";
  import {
    CLUSTER,
    connection,
    decodeSubscription,
    explorerTxUrl,
    fetchInvoicesOfMerchant,
    fetchPlans,
    findInvoicePda,
    findSubscriptionPda,
    formatPeriod,
    sha256Hex,
    shortAddr,
  } from "../lib/chain.js";
  import type { Invoice, Plan, Subscription } from "../lib/chain.js";
  import { batchActionUrl, invoiceActionUrl } from "../lib/blinks.js";
  import { toast } from "../lib/ui.js";
  import { signAndSendAction, wallet } from "../lib/wallet.js";
  import { feeFor, formatTokenAmount } from "../lib/fee.js";
  import { decimalsFor } from "../lib/mints.js";
  import { lang, t } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-fee.js";
  import "../lib/i18n-merch2.js";
  import "../lib/i18n-port2.js";
  import { DEMO_RECEIPTS, isDemoMode } from "../lib/demo.js";
  import type { DemoReceipt } from "../lib/demo.js";

  let selectedPlan = $state("");
  let subscriberInput = $state("");
  let loadedSub = $state<Subscription | null>(null);
  let subDerivedPda = $state<string | null>(null);
  let subError = $state<string | null>(null);
  let subBusy = $state(false);
  let invoiceId = $state("1");
  let buyer = $state("");
  let details = $state("");
  let memoPreview = $state<string | null>(null);
  let busy = $state(false);
  let invoices = $state<Invoice[]>([]);
  let plans = $state<Map<string, Plan>>(new Map());
  let loading = $state(false);
  let selected = $state<Set<string>>(new Set());
  let expanded = $state<Set<string>>(new Set());
  let demo = $state(false);
  let demoReceipts = $state<DemoReceipt[]>([]);

  // Memo-proof side panel: purely presentational pick from existing state —
  // expanded first, then selected, then the head of the list. No new fetches.
  const proofLive = $derived(
    invoices.find((i) => expanded.has(i.address.toBase58())) ??
      invoices.find((i) => selected.has(i.address.toBase58())) ??
      invoices[0] ??
      null,
  );
  const proofDemoItem = $derived(
    demoReceipts.find((r) => expanded.has(r.id)) ?? demoReceipts[0] ?? null,
  );

  const unpaidAddrs = $derived(
    invoices.filter((i) => i.status === "unpaid").map((i) => i.address.toBase58()),
  );
  const allSelected = $derived(unpaidAddrs.length > 0 && unpaidAddrs.every((a) => selected.has(a)));
  // Protocol base fee per signature: honest estimate, real count.
  const batchFeeLamports = $derived(selected.size * 5000);

  // Protocol fee (0.4% via feeFor() in fee.ts) over the picked unpaid
  // invoices — the merchant leg is amount − fee. Quoted in token units when
  // every picked invoice shares one known mint's decimals, raw units otherwise.
  const batchProtocolFee = $derived.by(() => {
    let fee = 0n;
    let decimals: number | null = null;
    let seen = false;
    let mixed = false;
    for (const inv of invoices) {
      if (!selected.has(inv.address.toBase58()) || inv.status !== "unpaid") continue;
      fee += feeFor(inv.amount);
      const mint = plans.get(inv.plan.toBase58())?.mint.toBase58() ?? null;
      const dec = mint === null ? null : decimalsFor(mint);
      if (!seen) {
        decimals = dec;
        seen = true;
      } else if (decimals !== dec) {
        mixed = true;
      }
    }
    return { fee, decimals: mixed ? null : decimals };
  });

  const merchant = $derived($wallet.address);
  const myPlans = $derived(
    [...plans.values()].filter((p) => merchant !== null && p.merchant.equals(merchant)),
  );
  const selectedPlanObj = $derived(plans.get(selectedPlan) ?? null);
  // Dates follow the active UI language (same convention as ReceiptHistory).
  const dateLocale = $derived($lang === "pl" ? "pl-PL" : "en-US");
  // Lamports → SOL appendix (1 SOL = 1e9 lamports): raw lamports alone are unreadable.
  const batchFeeSolLabel = $derived(
    (Number(batchFeeLamports) / 1e9).toFixed(6).replace(/\.?0+$/, ""),
  );

  const formValid = $derived(
    merchant !== null &&
      selectedPlanObj !== null &&
      loadedSub !== null &&
      loadedSub.status === "active" &&
      loadedSub.plan.equals(selectedPlanObj.address) &&
      Number.isInteger(Number(invoiceId)) &&
      Number(invoiceId) >= 0,
  );

  const invoicePdaPreview = $derived.by(() => {
    if (loadedSub === null || !/^\d+$/.test(invoiceId.trim())) return null;
    try {
      return findInvoicePda(loadedSub.address, BigInt(invoiceId.trim()))[0].toBase58();
    } catch {
      return null;
    }
  });

  function metadata(): string {
    return JSON.stringify({ buyer: buyer.trim(), details: details.trim(), invoiceId: invoiceId.trim() });
  }

  // Keep the memo-hash preview in sync without blocking typing.
  $effect(() => {
    const text = metadata();
    let cancelled = false;
    void sha256Hex(text).then((h) => {
      if (!cancelled) memoPreview = h;
    });
    return () => {
      cancelled = true;
    };
  });

  // Merchant login/logout (re)loads their plans and invoices. The tracked
  // dependency is the synchronous `merchant` read inside refresh() (before
  // its first await); out-of-order responses are dropped by the refreshSeq
  // guard there.
  $effect(() => {
    void refresh();
  });

  async function loadSubscription(): Promise<void> {
    loadedSub = null;
    subDerivedPda = null;
    subError = null;
    if (merchant === null) {
      toast.err($t("invoice.noWallet"), { body: $t("invoice.noWalletBody") });
      return;
    }
    if (selectedPlanObj === null) {
      subError = $t("invoice.errPickPlan");
      return;
    }
    let subscriber: PublicKey;
    try {
      subscriber = new PublicKey(subscriberInput.trim());
    } catch {
      subError = $t("invoice.errBadSub");
      return;
    }
    subBusy = true;
    try {
      const [pda] = findSubscriptionPda(selectedPlanObj.address, subscriber);
      subDerivedPda = pda.toBase58();
      const info = await connection().getAccountInfo(pda);
      if (!info) {
        subError = $t("invoice.errNoSub");
        return;
      }
      const sub = decodeSubscription(pda, info.data);
      if (sub === null) {
        subError = $t("invoice.errNotSub");
        return;
      }
      if (!sub.plan.equals(selectedPlanObj.address)) {
        subError = $t("invoice.errWrongPlan");
        return;
      }
      if (sub.status !== "active") {
        subError = $t("invoice.errCancelled");
        return;
      }
      loadedSub = sub;
    } catch (err) {
      subError = err instanceof Error ? err.message : $t("invoice.errReadSub");
    } finally {
      subBusy = false;
    }
  }

  async function createInvoice(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (merchant === null) {
      toast.err($t("invoice.noWallet"), { body: $t("invoice.noWalletBody") });
      return;
    }
    if (selectedPlanObj === null || loadedSub === null) {
      toast.err($t("invoice.errNoData"), { body: $t("invoice.errNoDataBody") });
      return;
    }
    busy = true;
    try {
      const memo = memoPreview ?? (await sha256Hex(metadata()));
      const { signature } = await signAndSendAction(
        invoiceActionUrl({
          plan: selectedPlanObj.address.toBase58(),
          subscription: loadedSub.address.toBase58(),
          invoiceId: invoiceId.trim(),
          memo,
        }),
      );
      toast.ok($t("invoice.created"), {
        body: signature,
        link: { label: $t("invoice.viewInExplorer"), href: explorerTxUrl(signature) },
      });
      await refresh();
      window.dispatchEvent(new CustomEvent("solhack:merchant-changed"));
    } catch (err) {
      toast.err($t("invoice.createFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      busy = false;
    }
  }

  // Monotonic sequence: a newer refresh() (merchant change, manual refresh,
  // post-mutation reload) invalidates every in-flight older one, so a slow
  // response can never overwrite state with another account's data.
  let refreshSeq = 0;

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;
    // Snapshot before the first await: `m` is both the tracked dependency of
    // the merchant $effect and the stable value the guards below compare.
    const m = merchant;
    demo = isDemoMode();
    if (demo) {
      // Demo mode: fixtures instead of chain fetches. No mocks of our own.
      demoReceipts = DEMO_RECEIPTS;
      invoices = [];
      selected = new Set();
      loading = false;
      return;
    }
    if (m === null) {
      invoices = [];
      plans = new Map();
      return;
    }
    loading = true;
    try {
      const conn = connection();
      const [invList, planList] = await Promise.all([
        fetchInvoicesOfMerchant(conn, m),
        fetchPlans(conn),
      ]);
      if (seq !== refreshSeq) return;
      invoices = invList;
      plans = new Map(planList.map((p) => [p.address.toBase58(), p]));
      if (selectedPlan !== "" && !plans.has(selectedPlan)) selectedPlan = "";
      if (selectedPlan === "") {
        const firstMine = planList.find((p) => p.merchant.equals(m));
        selectedPlan = firstMine?.address.toBase58() ?? "";
      }
    } catch (err) {
      if (seq !== refreshSeq) return;
      toast.err($t("invoice.listFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      // A superseded run must not clear the flag of a newer in-flight one.
      if (seq === refreshSeq) loading = false;
    }
  }

  function toggle(addr: string): void {
    const next = new Set(selected);
    if (next.has(addr)) next.delete(addr);
    else next.add(addr);
    selected = next;
  }

  function toggleAll(): void {
    selected = allSelected ? new Set() : new Set(unpaidAddrs);
  }

  function toggleMemo(key: string): void {
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded = next;
  }

  function reportUrl(invoiceAddr: string): string {
    const cluster = CLUSTER === "mainnet-beta" ? "" : `?cluster=${CLUSTER}`;
    return `https://explorer.solana.com/address/${invoiceAddr}${cluster}`;
  }

  function lastPaidLabel(inv: Invoice): string {
    if (inv.status === "paid" && inv.paidAt > 0n) {
      return new Date(Number(inv.paidAt) * 1000).toLocaleDateString(dateLocale);
    }
    return "—";
  }

  // Fee figure for the mono footers; raw base units when the picked mints
  // have unknown or mixed decimals (mirrors the memo panel's "units" style).
  function feeLabel(fee: bigint, decimals: number | null): string {
    return decimals === null ? `${fee.toString()} units` : formatTokenAmount(fee, decimals);
  }

  // Row amount: UI amount in the plan mint's decimals (same data the fee
  // quote uses); raw units as the honest fallback when the plan account is
  // not in the loaded map.
  function amountLabel(inv: Invoice): string {
    const mint = plans.get(inv.plan.toBase58())?.mint.toBase58() ?? null;
    const dec = mint === null ? null : decimalsFor(mint);
    return dec === null ? `${inv.amount.toString()} units` : formatTokenAmount(inv.amount, dec);
  }

  async function batchCharge(): Promise<void> {
    const picked = invoices.filter((i) => selected.has(i.address.toBase58()) && i.status === "unpaid");
    if (picked.length === 0) {
      toast.err($t("invoice.noSelection"), { body: $t("invoice.noSelectionBody") });
      return;
    }
    busy = true;
    try {
      const items: { plan: string; subscription: string; invoice: string; subscriberAta: string; mint: string }[] =
        [];
      for (const i of picked) {
        const mint = plans.get(i.plan.toBase58())?.mint ?? null;
        if (mint === null) {
          toast.err($t("invoice.noPlan"), { body: `Plan ${i.plan.toBase58()} ${$t("invoice.planHidden")}` });
          return;
        }
        items.push({
          plan: i.plan.toBase58(),
          subscription: i.subscription.toBase58(),
          invoice: i.address.toBase58(),
          subscriberAta: getAssociatedTokenAddressSync(mint, i.subscriber).toBase58(),
          mint: mint.toBase58(),
        });
      }
      const { signature } = await signAndSendAction(batchActionUrl(), { items });
      toast.ok(`${$t("invoice.batchDone")}: ${items.length}`, {
        body: signature,
        link: { label: $t("invoice.viewInExplorer"), href: explorerTxUrl(signature) },
      });
      selected = new Set();
      await refresh();
      window.dispatchEvent(new CustomEvent("solhack:merchant-changed"));
    } catch (err) {
      toast.err($t("invoice.batchFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      busy = false;
    }
  }
</script>

<div class="glass p-6 sm:p-8">
  <h2 class="text-lg font-bold" data-i18n="invoice.title">Recurring invoices</h2>
  <p class="mt-1 text-sm text-white/55" data-i18n="invoice.lead">
    Issue an invoice against a subscription (metadata hash lands on-chain); batch-charge up to 8 invoices in one
    transaction. A paid invoice + metadata is a verifiable receipt.
  </p>
  <form class="mt-4 space-y-3" onsubmit={(e) => void createInvoice(e)}>
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-white/70" data-i18n="invoice.planLabel">Plan (your on-chain plans)</span>
      <select
        class="field w-full px-3.5 py-2.5 font-mono text-xs"
        bind:value={selectedPlan}
        onchange={() => {
          // A user-picked plan invalidates any previously loaded subscription
          // immediately (no post-render effect pass, no one-frame stale
          // state). formValid re-checks plan conformity on every read, so
          // this wipe is complete.
          loadedSub = null;
          subDerivedPda = null;
          subError = null;
        }}
        disabled={loading || myPlans.length === 0}
      >
        {#if myPlans.length === 0}
          <option value="" data-i18n="invoice.noPlans">No plans — create a plan above</option>
        {:else}
          {#each myPlans as p (p.address.toBase58())}
            <option value={p.address.toBase58()}>
              Plan #{p.planId.toString()} · {shortAddr(p.address, 4)}… · {formatPeriod(p.periodSeconds, $lang)}
            </option>
          {/each}
        {/if}
      </select>
    </label>
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-white/70" data-i18n="invoice.subscriberLabel">Subscriber (client address)</span>
      <span class="flex flex-col gap-2 sm:flex-row">
        <input
          id="inv-sub"
          class="field w-full min-w-0 flex-1 px-3.5 py-2.5 font-mono text-xs"
          placeholder="Subscriber wallet address…"
          data-i18n-ph="invoice.subscriberPh"
          bind:value={subscriberInput}
          spellcheck={false}
          aria-invalid={subError !== null}
          aria-describedby={subError !== null ? "inv-sub-err" : subDerivedPda !== null ? "inv-sub-ok" : undefined}
        />
        <button
          type="button"
          class="btn-ghost shrink-0 cursor-pointer self-start px-4 py-2 text-xs font-bold disabled:opacity-40"
          disabled={subBusy || selectedPlanObj === null}
          onclick={() => void loadSubscription()}
        >
          {subBusy ? $t("port2.form.loadingSub") : $t("invoice.loadSub")}
        </button>
      </span>
      {#if subDerivedPda !== null}
        <span id="inv-sub-ok" class="inv-monorow">
          sub PDA: {shortAddr(new PublicKey(subDerivedPda), 6)}…
          {#if loadedSub !== null}
            · <span class="text-[#14f195]" data-i18n="invoice.subActive">active, matches the plan</span>
          {:else if subError !== null}
            · <span id="inv-sub-err" class="text-[#ffb4ab]" role="alert">{subError}</span>
          {/if}
        </span>
      {:else if subError !== null}
        <span id="inv-sub-err" class="inv-monorow text-[#ffb4ab]/90" role="alert">{subError}</span>
      {/if}
    </label>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <input
        id="inv-id"
        class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs"
        placeholder="invoice_id"
        aria-label="invoice_id"
        bind:value={invoiceId}
        aria-invalid={invoiceId.trim() !== "" &&
          (!Number.isInteger(Number(invoiceId)) || Number(invoiceId) < 0)}
        aria-describedby={!formValid && !busy ? "inv-form-hint" : undefined}
      />
      <input
        class="field w-full min-w-0 px-3.5 py-2.5 text-sm"
        placeholder="Buyer / customer name"
        data-i18n-ph="invoice.buyerPh"
        aria-label={$t("invoice.buyerPh")}
        bind:value={buyer}
      />
    </div>
    <textarea
      class="field w-full px-3.5 py-2.5 text-sm"
      rows="2"
      placeholder="Line items, dates, e.g. “Pro plan — March, 2 seats, 30d terms”"
      data-i18n-ph="invoice.detailsPh"
      aria-label={$t("invoice.detailsPh")}
      bind:value={details}
    ></textarea>
    {#if memoPreview !== null}
      <p class="inv-monorow normal-case">
        memo_hash: {memoPreview.slice(0, 32)}…{#if invoicePdaPreview !== null}
          · invoice PDA: {shortAddr(new PublicKey(invoicePdaPreview), 6)}…{/if}
      </p>
    {/if}
    <button
      class="btn-stitch cursor-pointer px-4 py-2 text-sm font-bold disabled:opacity-40"
      disabled={!formValid || busy}
      type="submit"
    >
      {busy ? $t("port2.form.signing") : $t("invoice.submit")}
    </button>
    {#if !formValid && !busy}
      <!-- Disabled-state microcopy next to the submit: pinpoints the missing
           step with existing keys instead of a generic wall of text. -->
      <p id="inv-form-hint" class="text-xs text-white/40">
        {#if merchant === null}{$t("invoice.noWalletBody")}
        {:else if selectedPlanObj === null}{$t("invoice.errPickPlan")}
        {:else if loadedSub === null}{$t("invoice.errNoDataBody")}
        {:else}{$t("invoice.errNoData")}{/if}
      </p>
    {/if}
  </form>

  <div class="mt-6 flex flex-wrap items-center justify-between gap-2">
    <h3 class="text-sm font-bold" data-i18n="invoice.mine">My invoices</h3>
    <button
      class="cursor-pointer font-mono text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff] disabled:opacity-40"
      onclick={() => void refresh()}
      disabled={loading || merchant === null}
    >
      {loading ? $t("port2.form.refreshing") : $t("invoice.refresh")}
    </button>
  </div>
  {#if demo}
    <div class="mt-3 grid items-start gap-4 lg:grid-cols-12">
      <div class="lg:col-span-8">
        <div class="inv-qhead">
          <p class="inv-qtitle">
            <span data-i18n="port2.queue.title">Invoice queue</span> · {demoReceipts.length}
            <span data-i18n="port2.queue.invoicesWord">invoices</span>
          </p>
          <p class="inv-qmeta"><span class="chip-active" data-i18n="m2.inv.paid">paid</span></p>
        </div>
        <div class="inv-tablewrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th data-i18n="m2.inv.colSub">Subscriber</th>
                <th data-i18n="m2.inv.colPlan">Plan · Invoice</th>
                <th data-i18n="m2.inv.colAmount">Amount</th>
                <th data-i18n="m2.inv.colLast">Last</th>
                <th data-i18n="m2.inv.colStatus">Status</th>
                <th data-i18n="m2.inv.colMemo">Memo · Action</th>
              </tr>
            </thead>
            <tbody>
              {#each demoReceipts as r (r.id)}
                <tr>
                  <td class="font-mono text-white/70" data-i18n-title="m2.inv.demoSigTitle" title="Demo receipt signature (fixtures carry no subscriber)">
                    {r.signature}
                  </td>
                  <td>
                    <span class="text-white/85">{r.service}</span>
                    <br /><span class="font-mono text-white/45">{r.id}</span>
                  </td>
                  <td class="font-mono text-white/85">{r.amount}</td>
                  <td class="font-mono text-white/60">{r.when}</td>
                  <td><span class="chip-active" data-i18n="m2.inv.paid">paid</span></td>
                  <td>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]"
                      onclick={() => toggleMemo(r.id)}
                    >
                      {expanded.has(r.id) ? $t("m2.inv.hideMemo") : $t("m2.inv.showMemo")}
                    </button>
                    {#if expanded.has(r.id)}
                      <p class="mt-1 font-mono text-[11px] break-all text-white/55">
                        <span data-i18n="m2.inv.memoHash">memo hash (sha256, on-chain)</span>: {r.signature} · slot {r.slot}
                      </p>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="inv-cards">
          {#each demoReceipts as r (r.id)}
            <article class="inv-cardrow">
              <div class="flex items-center justify-between gap-2">
                <p class="font-mono text-xs text-white/80">{r.signature}</p>
                <span class="chip-active" data-i18n="m2.inv.paid">paid</span>
              </div>
              <dl class="mt-2 space-y-1.5 text-xs">
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colPlan">Plan · Invoice</dt>
                  <dd>{r.service} · <span class="font-mono">{r.id}</span></dd>
                </div>
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colAmount">Amount</dt>
                  <dd class="font-mono">{r.amount}</dd>
                </div>
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colLast">Last</dt>
                  <dd class="font-mono">{r.when}</dd>
                </div>
              </dl>
              <button
                type="button"
                class="mt-2 cursor-pointer text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]"
                onclick={() => toggleMemo(r.id)}
              >
                {expanded.has(r.id) ? $t("m2.inv.hideMemo") : $t("m2.inv.showMemo")}
              </button>
              {#if expanded.has(r.id)}
                <p class="mt-1 font-mono text-[11px] break-all text-white/55">
                  <span data-i18n="m2.inv.memoHash">memo hash (sha256, on-chain)</span>: {r.signature} · slot {r.slot}
                </p>
              {/if}
            </article>
          {/each}
        </div>
      </div>
      <aside class="glass p-5 lg:col-span-4" aria-label="Memo proof" data-i18n-aria="port2.memo.kicker">
        <div class="flex items-center justify-between gap-2">
          <p class="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-[#cec2d8] uppercase">
            <span class="msym text-[18px] text-[#00dbe9]" aria-hidden="true">receipt_long</span>
            <span data-i18n="port2.memo.kicker">Invoice memo (memo_hash)</span>
          </p>
          <span class="tag-pill tag-pill--cyan" data-i18n="port2.memo.proof">On-chain proof</span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-white/55" data-i18n="port2.memo.lead">
          Every charge carries a compact memo_hash in the invoice account — a fiscally verifiable receipt hash, no central webhook.
        </p>
        {#if proofDemoItem !== null}
          <div class="memo-term mt-3">
            <div class="memo-term-head">
              <span data-i18n="port2.memo.invoice">Invoice</span> {proofDemoItem.id}
            </div>
            <div class="memo-term-body">
              <div><span class="mp">CARGOBILL-V1</span> {"{"}</div>
              <div class="pl-3"><span class="mk">"service"</span>: "{proofDemoItem.service}",</div>
              <div class="pl-3"><span class="mk">"slot"</span>: "{proofDemoItem.slot}",</div>
              <div class="pl-3"><span class="mk">"sig"</span>: "{proofDemoItem.signature}"</div>
              <div>{"}"}</div>
            </div>
          </div>
        {:else}
          <p class="inv-proof-empty mt-3" data-i18n="port2.memo.empty">Select an invoice to preview its memo proof here.</p>
        {/if}
        <div class="inv-comply mt-3 flex items-start gap-3">
          <span class="msym mt-0.5 text-[20px] text-[#14f195]" aria-hidden="true">verified_user</span>
          <div class="min-w-0">
            <p class="text-[13px] font-semibold text-[#e1e1f0]" data-i18n="port2.memo.compliance">Bookkeeping compliance</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-white/55" data-i18n="port2.memo.complianceBody">
              The memo hash lands in the Solana block — an immutable receipt an auditor can replay.
            </p>
          </div>
        </div>
      </aside>
    </div>
    <p class="mt-3 text-xs text-white/40" data-i18n="m2.inv.demoNote">Demo receipts — charging is disabled in demo mode.</p>
  {:else if invoices.length === 0}
    <p class="mt-2 text-sm text-white/40" data-i18n="m2.inv.empty">No invoices yet — pick a plan, load an active subscription above and issue the first invoice.</p>
  {:else}
    <div class="mt-3 grid items-start gap-4 lg:grid-cols-12">
      <div class="lg:col-span-8">
        <div class="inv-qhead">
          <p class="inv-qtitle">
            <span data-i18n="port2.queue.title">Invoice queue</span> · {invoices.length}
            <span data-i18n="port2.queue.invoicesWord">invoices</span> · {selected.size}
            <span data-i18n="port2.queue.selectedBatch">selected for batch</span>
          </p>
          <p class="inv-qmeta">
            {unpaidAddrs.length} <span data-i18n="port2.queue.waiting">waiting for the next batch</span>
          </p>
        </div>
        <div class="inv-tablewrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th class="w-8">
                  <input
                    type="checkbox"
                    class="inv-check"
                    checked={allSelected}
                    disabled={unpaidAddrs.length === 0}
                    onchange={() => toggleAll()}
                    data-i18n-aria="m2.inv.selectAll" aria-label="Select all unpaid"
                  />
                </th>
                <th data-i18n="m2.inv.colSub">Subscriber</th>
                <th data-i18n="m2.inv.colPlan">Plan · Invoice</th>
                <th data-i18n="m2.inv.colAmount">Amount</th>
                <th data-i18n="m2.inv.colLast">Last</th>
                <th data-i18n="m2.inv.colStatus">Status</th>
                <th data-i18n="m2.inv.colMemo">Memo · Action</th>
              </tr>
            </thead>
            <tbody>
              {#each invoices as inv (inv.address.toBase58())}
                {@const addr = inv.address.toBase58()}
                <tr>
                  <td>
                    <input
                      type="checkbox"
                      class="inv-check"
                      checked={selected.has(addr)}
                      disabled={inv.status !== "unpaid"}
                      onchange={() => toggle(addr)}
                      aria-label={`${$t("m2.inv.selectOne")} #${inv.invoiceId.toString()}`}
                    />
                  </td>
                  <td class="font-mono text-white/80" title={inv.subscriber.toBase58()}>
                    {shortAddr(inv.subscriber, 4)}…
                    <br /><span class="text-[11px] text-white/35" title={inv.subscription.toBase58()}>sub {inv.subscription.toBase58().slice(0, 8)}…</span>
                  </td>
                  <td class="font-mono" title={inv.plan.toBase58()}>
                    <span class="text-white/85">#{inv.invoiceId.toString()}</span>
                    <br /><span class="text-[11px] text-white/45">
                      {#if plans.get(inv.plan.toBase58()) !== undefined}
                        Plan #{plans.get(inv.plan.toBase58())?.planId.toString()} ·
                      {/if}
                      {inv.plan.toBase58().slice(0, 8)}…</span
                    >
                  </td>
                  <td class="font-mono text-white/85">{amountLabel(inv)}</td>
                  <td class="font-mono text-white/60">
                    {lastPaidLabel(inv)}
                    {#if inv.status === "unpaid"}<br /><span class="text-[11px] text-white/35" data-i18n="m2.inv.neverPaid">not charged yet</span>{/if}
                  </td>
                  <td>
                    {#if inv.status === "paid"}
                      <span class="chip-active" data-i18n="m2.inv.paid">paid</span>
                    {:else if inv.status === "unpaid"}
                      <span class="tag-pill tag-pill--cyan" data-i18n="m2.inv.unpaid">unpaid</span>
                    {:else if inv.status === "voided"}
                      <span class="font-mono text-[11px] text-white/40" data-i18n="m2.inv.voided">voided</span>
                    {:else}
                      <span class="font-mono text-[11px] text-white/40">{inv.status}</span>
                    {/if}
                  </td>
                  <td>
                    <button
                      type="button"
                      class="cursor-pointer text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]"
                      onclick={() => toggleMemo(addr)}
                    >
                      {expanded.has(addr) ? $t("m2.inv.hideMemo") : $t("m2.inv.showMemo")}
                    </button>
                    {#if expanded.has(addr)}
                      <p class="mt-1 font-mono text-[11px] break-all text-white/55">
                        <span data-i18n="m2.inv.memoHash">memo hash (sha256, on-chain)</span>: {inv.memoHash}
                        <br /><a class="text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]" href={reportUrl(addr)} target="_blank" rel="noreferrer" data-i18n="m2.inv.report"
                          >Open account in Explorer</a
                        >
                      </p>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="inv-cards">
          {#each invoices as inv (inv.address.toBase58())}
            {@const addr = inv.address.toBase58()}
            <article class="inv-cardrow">
              <div class="flex items-center justify-between gap-2">
                <label class="flex items-center gap-2 font-mono text-xs text-white/85">
                  <input
                    type="checkbox"
                    class="inv-check"
                    checked={selected.has(addr)}
                    disabled={inv.status !== "unpaid"}
                    onchange={() => toggle(addr)}
                    aria-label={`${$t("m2.inv.selectOne")} #${inv.invoiceId.toString()}`}
                  />
                  #{inv.invoiceId.toString()}
                </label>
                {#if inv.status === "paid"}
                  <span class="chip-active" data-i18n="m2.inv.paid">paid</span>
                {:else if inv.status === "unpaid"}
                  <span class="tag-pill tag-pill--cyan" data-i18n="m2.inv.unpaid">unpaid</span>
                {:else if inv.status === "voided"}
                  <span class="font-mono text-[11px] text-white/40" data-i18n="m2.inv.voided">voided</span>
                {:else}
                  <span class="font-mono text-[11px] text-white/40">{inv.status}</span>
                {/if}
              </div>
              <dl class="mt-2 space-y-1.5 text-xs">
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colSub">Subscriber</dt>
                  <dd class="font-mono" title={inv.subscriber.toBase58()}>{shortAddr(inv.subscriber, 4)}…</dd>
                </div>
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colPlan">Plan · Invoice</dt>
                  <dd class="font-mono" title={inv.plan.toBase58()}>{inv.plan.toBase58().slice(0, 8)}…</dd>
                </div>
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colAmount">Amount</dt>
                  <dd class="font-mono">{amountLabel(inv)}</dd>
                </div>
                <div class="inv-kv">
                  <dt data-i18n="m2.inv.colLast">Last</dt>
                  <dd class="font-mono">{lastPaidLabel(inv)}</dd>
                </div>
              </dl>
              <button
                type="button"
                class="mt-2 cursor-pointer text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]"
                onclick={() => toggleMemo(addr)}
              >
                {expanded.has(addr) ? $t("m2.inv.hideMemo") : $t("m2.inv.showMemo")}
              </button>
              {#if expanded.has(addr)}
                <p class="mt-1 font-mono text-[11px] break-all text-white/55">
                  <span data-i18n="m2.inv.memoHash">memo hash (sha256, on-chain)</span>: {inv.memoHash}
                  <br /><a class="text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]" href={reportUrl(addr)} target="_blank" rel="noreferrer" data-i18n="m2.inv.report"
                    >Open account in Explorer</a
                  >
                </p>
              {/if}
            </article>
          {/each}
        </div>
        <div class="inv-qfoot">
          <span>{unpaidAddrs.length} <span data-i18n="port2.queue.waiting">waiting for the next batch</span></span>
          {#if selected.size > 0}
            <span
              ><span data-i18n="port2.queue.gas">Est. batch network fee</span> ≈
              {batchFeeLamports.toLocaleString(dateLocale)} lamports (≈ {batchFeeSolLabel} SOL) ·
              <span class="text-white/35" data-i18n="port2.queue.lamportsHint">5000 lamports per signature</span></span
            >
            <span data-i18n-title="fee.hint" title="0.4% of every charge settles to the protocol treasury">
              <span data-i18n="m2.inv.feeProtocol">protocol fee 0,4%</span>
              ≈ {feeLabel(batchProtocolFee.fee, batchProtocolFee.decimals)}
            </span>
          {/if}
        </div>
      </div>
      <aside class="glass p-5 lg:col-span-4" aria-label="Memo proof" data-i18n-aria="port2.memo.kicker">
        <div class="flex items-center justify-between gap-2">
          <p class="flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] text-[#cec2d8] uppercase">
            <span class="msym text-[18px] text-[#00dbe9]" aria-hidden="true">receipt_long</span>
            <span data-i18n="port2.memo.kicker">Invoice memo (memo_hash)</span>
          </p>
          <span class="tag-pill tag-pill--cyan" data-i18n="port2.memo.proof">On-chain proof</span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-white/55" data-i18n="port2.memo.lead">
          Every charge carries a compact memo_hash in the invoice account — a fiscally verifiable receipt hash, no central webhook.
        </p>
        {#if proofLive !== null}
          {@const proofAddr = proofLive.address.toBase58()}
          <div class="memo-term mt-3">
            <div class="memo-term-head">
              <span data-i18n="port2.memo.program">memo_hash · invoice PDA</span>
              <span class="font-mono text-[10px] text-[#14f195]">#{proofLive.invoiceId.toString()}</span>
            </div>
            <div class="memo-term-body">
              <div><span class="mp">CARGOBILL-V1</span> {"{"}</div>
              <div class="pl-3"><span class="mk">"plan"</span>: "{proofLive.plan.toBase58().slice(0, 8)}…",</div>
              <div class="pl-3"><span class="mk">"subscriber"</span>: "{shortAddr(proofLive.subscriber, 4)}…",</div>
              <div class="pl-3"><span class="mk">"amount"</span>: "{proofLive.amount.toString()} units",</div>
              <div class="pl-3"><span class="mk">"memo"</span>: "{proofLive.memoHash.slice(0, 16)}…"</div>
              <div>{"}"}</div>
            </div>
            <p class="memo-term-hash"><span data-i18n="m2.inv.memoHash">memo hash (sha256, on-chain)</span>: {proofLive.memoHash}</p>
            <a class="memo-term-link" href={reportUrl(proofAddr)} target="_blank" rel="noreferrer" data-i18n="m2.inv.report"
              >Open account in Explorer</a
            >
          </div>
        {:else}
          <p class="inv-proof-empty mt-3" data-i18n="port2.memo.empty">Select an invoice to preview its memo proof here.</p>
        {/if}
        <div class="inv-comply mt-3 flex items-start gap-3">
          <span class="msym mt-0.5 text-[20px] text-[#14f195]" aria-hidden="true">verified_user</span>
          <div class="min-w-0">
            <p class="text-[13px] font-semibold text-[#e1e1f0]" data-i18n="port2.memo.compliance">Bookkeeping compliance</p>
            <p class="mt-0.5 text-[11px] leading-relaxed text-white/55" data-i18n="port2.memo.complianceBody">
              The memo hash lands in the Solana block — an immutable receipt an auditor can replay.
            </p>
          </div>
        </div>
      </aside>
    </div>
    <div class="mt-3 flex flex-wrap items-center gap-3">
      <!-- Batch charge in flight: spinner + explicit label instead of a bare ellipsis. -->
      <button
        class="btn-stitch inline-flex cursor-pointer items-center gap-1.5 px-4 py-2 text-sm font-bold disabled:opacity-40"
        disabled={selected.size === 0 || busy}
        onclick={() => void batchCharge()}
      >
        {#if busy}
          <span class="msym animate-spin text-[16px]" aria-hidden="true">progress_activity</span>
          <span data-i18n="port2.batch.working">Charging…</span>
        {:else}
          {$t("invoice.batch")} ({selected.size})
        {/if}
      </button>
      {#if selected.size > 0}
        <p class="font-mono text-[11px] text-white/45">
          <span data-i18n="m2.inv.feeEst">est. fee</span> ≈ {batchFeeLamports.toLocaleString(dateLocale)} lamports (≈ {batchFeeSolLabel} SOL) ({selected.size} × {(5000).toLocaleString(dateLocale)})
        </p>
        <p class="font-mono text-[11px] text-white/45" data-i18n-title="fee.hint" title="0.4% of every charge settles to the protocol treasury">
          <span data-i18n="m2.inv.feeProtocol">protocol fee 0,4%</span>
          ≈ {feeLabel(batchProtocolFee.fee, batchProtocolFee.decimals)}
        </p>
      {/if}
    </div>
  {/if}
</div>
<style>
  /* Module 02 Void skin (component scope). Cards use the global .glass. */
  .inv-monorow {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    line-height: 16px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(206, 194, 216, 0.75);
    word-break: break-all;
  }
  .inv-qhead {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
    padding: 12px 4px;
  }
  .inv-qtitle {
    font-family: "Space Grotesk", "Inter", system-ui, sans-serif;
    font-size: 15px;
    font-weight: 600;
    color: #e1e1f0;
    font-variant-numeric: tabular-nums;
  }
  .inv-qmeta {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: rgba(225, 225, 240, 0.45);
  }
  .inv-tablewrap {
    overflow-x: auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    background: #1d1f29;
  }
  .inv-table {
    width: 100%;
    min-width: 720px;
    text-align: left;
    font-size: 12px;
    border-collapse: collapse;
  }
  .inv-table thead tr {
    background: rgba(12, 14, 23, 0.7);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(206, 194, 216, 0.6);
  }
  .inv-table th,
  .inv-table td {
    padding: 8px 12px;
    vertical-align: top;
  }
  .inv-table tbody tr {
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    transition: background 0.12s ease;
  }
  .inv-table tbody tr:hover {
    background: rgba(153, 69, 255, 0.05);
  }
  .inv-check {
    width: 15px;
    height: 15px;
    accent-color: #9945ff;
    cursor: pointer;
  }
  .inv-check:disabled {
    cursor: not-allowed;
    opacity: 0.35;
  }
  .inv-qfoot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    padding: 10px 4px 0;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: rgba(225, 225, 240, 0.45);
    font-variant-numeric: tabular-nums;
  }
  .memo-term {
    background: rgba(12, 14, 23, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    line-height: 1.65;
    overflow: hidden;
  }
  .memo-term-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(206, 194, 216, 0.6);
  }
  .memo-term-body {
    margin-top: 8px;
    color: #e1e1f0;
    word-break: break-all;
  }
  .memo-term-body .mp {
    color: #9945ff;
    font-weight: 600;
  }
  .memo-term-body .mk {
    color: #00f0ff;
  }
  .memo-term-hash {
    margin-top: 8px;
    word-break: break-all;
    color: rgba(225, 225, 240, 0.55);
  }
  .memo-term-link {
    display: inline-block;
    margin-top: 6px;
    color: #7df4ff;
    text-decoration: underline;
    word-break: break-all;
    transition: color 150ms ease;
  }
  .memo-term-link:hover {
    color: #00f0ff;
  }
  .inv-proof-empty {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    color: rgba(225, 225, 240, 0.35);
  }
  .inv-comply {
    background: #1d1f29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px;
  }
  .inv-cards {
    display: none;
  }
  @media (max-width: 767px) {
    .inv-tablewrap {
      display: none;
    }
    .inv-cards {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  }
  .inv-cardrow {
    background: #1d1f29;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 12px;
  }
  .inv-kv {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .inv-kv dt {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(206, 194, 216, 0.6);
    flex-shrink: 0;
  }
  .inv-kv dd {
    color: rgba(225, 225, 240, 0.85);
    text-align: right;
    word-break: break-all;
  }
</style>
