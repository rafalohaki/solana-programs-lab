<script lang="ts">
  import { explorerTxUrl } from "../lib/chain.js";
  import { formatTokenAmount } from "../lib/fee.js";
  import { lang, t } from "../lib/i18n.js";
  import { CUSTOM_MINT, KNOWN_MINTS, decimalsFor, parseUiAmountToRaw } from "../lib/mints.js";
  import { copyText, toast } from "../lib/ui.js";
  import { wallet } from "../lib/wallet.js";
  import { isDemoMode } from "../lib/demo.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-port4.js";

  // -------------------------------------------------------------------------
  // Merchant panel: "Payment links & one-time". Generates a shareable
  // /pay?mode=pay link + SolhackPay.pay widget snippet from the connected
  // wallet, and lists one-time payments recorded by the backend
  // (GET /api/payments?merchant=). Every listed row was verified on-chain
  // server-side before being stored — nothing here is mocked; demo mode
  // honestly disables the panel instead of inventing fixtures.
  // -------------------------------------------------------------------------

  interface PaymentRow {
    id: number;
    merchant: string;
    mint: string | null;
    amount: string;
    memo: string | null;
    signature: string;
    createdAt: string | null;
  }

  interface ListResponse {
    payments?: PaymentRow[];
  }

  /** Native SOL: base units are lamports (protocol constant, no mint). */
  const SOL_DECIMALS = 9;
  const BASE58_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

  let amountUi = $state("");
  let tokenChoice = $state("sol"); // "sol" | KNOWN_MINTS mint | CUSTOM_MINT
  let customMint = $state("");
  let customDecimals = $state("6");
  let labelText = $state("");
  let payments = $state<PaymentRow[]>([]);
  let loading = $state(false);
  let demo = $state(false);
  /** window.location.origin only exists client-side; SSR renders "" and the
   *  shareable link appears right after hydration (client:idle island). */
  const siteOrigin = $derived(typeof window !== "undefined" ? window.location.origin : "");

  const merchant = $derived($wallet.address);
  const dateLocale = $derived($lang === "pl" ? "pl-PL" : "en-US");

  // Wallet login/logout (re)loads the recorded payments. The tracked
  // dependency is the synchronous `merchant` read inside refresh() before its
  // first await; out-of-order responses are dropped by the refreshSeq guard.
  $effect(() => {
    void refresh();
  });

  // Monotonic sequence: a newer refresh invalidates every in-flight older one
  // (wallet switch / manual refresh), same guard as InvoicesPanel.
  let refreshSeq = 0;

  async function refresh(): Promise<void> {
    const seq = ++refreshSeq;
    const m = merchant;
    demo = isDemoMode();
    if (demo || m === null) {
      // No fixtures for one-time payments: an honest empty list, never mocks.
      payments = [];
      loading = false;
      return;
    }
    loading = true;
    try {
      const res = await fetch(`/api/payments?merchant=${encodeURIComponent(m.toBase58())}`);
      const json = (await res.json()) as ListResponse;
      if (seq !== refreshSeq) return;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      payments = Array.isArray(json.payments) ? json.payments : [];
    } catch (err) {
      if (seq !== refreshSeq) return;
      payments = [];
      toast.err($t("pmpanel.listFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      if (seq === refreshSeq) loading = false;
    }
  }

  /** Resolved decimals for the picked token; null = invalid (blocks the form). */
  const decimals = $derived.by<number | null>(() => {
    if (tokenChoice === "sol") return SOL_DECIMALS;
    if (tokenChoice === CUSTOM_MINT) {
      const n = Number(customDecimals);
      return Number.isInteger(n) && n >= 0 && n <= 9 ? n : null;
    }
    return decimalsFor(tokenChoice);
  });

  const customMintValid = $derived(tokenChoice !== CUSTOM_MINT || BASE58_RE.test(customMint.trim()));

  const rawAmount = $derived(decimals === null ? null : parseUiAmountToRaw(amountUi, decimals));

  // Field-adjacent errors in the markup below reuse these deriveds directly
  // (badDecimals / badMint / badAmount) — no summary string needed.
  /** Mint param for the link: omitted for native SOL (server default). */
  const mintParam = $derived.by<string | null>(() => {
    if (tokenChoice === "sol") return null;
    if (tokenChoice === CUSTOM_MINT) return customMintValid ? customMint.trim() : null;
    return tokenChoice;
  });

  const formValid = $derived(merchant !== null && decimals !== null && customMintValid && rawAmount !== null && !demo);

  const payUrl = $derived.by<string>(() => {
    if (!formValid || merchant === null || rawAmount === null) return "";
    const qs = new URLSearchParams({
      mode: "pay",
      merchant: merchant.toBase58(),
      amount: rawAmount.toString(),
    });
    if (mintParam !== null) qs.set("mint", mintParam);
    if (labelText.trim() !== "") qs.set("label", labelText.trim());
    return `${siteOrigin}/pay?${qs.toString()}`;
  });

  // Widget snippet — the exact same shape EmbedPanel ships for subscriptions,
  // but calling SolhackPay.pay. "</" + "script>" split so the bundler never
  // sees a literal closing tag inside this block. Native SOL omits `mint`
  // (the endpoint treats a missing mint as SOL).
  const snippet = $derived.by<string>(() => {
    if (payUrl === "" || merchant === null || rawAmount === null) return "";
    const opts: string[] = [
      `merchant: ${JSON.stringify(merchant.toBase58())}`,
      `amount: "${rawAmount.toString()}"`,
    ];
    if (mintParam !== null) opts.push(`mint: ${JSON.stringify(mintParam)}`);
    if (labelText.trim() !== "") opts.push(`label: ${JSON.stringify(labelText.trim())}`);
    return (
      `<script src="https://solhack.rafal.si/widget.js"><` +
      `/script>\n<script>\n  SolhackPay.pay({ ${opts.join(", ")} });\n<` +
      `/script>`
    );
  });

  function rowAmountLabel(row: PaymentRow): string {
    try {
      const raw = BigInt(row.amount);
      if (row.mint === null) return `${formatTokenAmount(raw, SOL_DECIMALS)} SOL`;
      const dec = decimalsFor(row.mint);
      if (dec === null) return `${row.amount} ${$t("pmpanel.rawUnits")}`;
      const symbol = KNOWN_MINTS.find((m) => m.mint === row.mint)?.symbol ?? "";
      const formatted = formatTokenAmount(raw, dec);
      return symbol === "" ? formatted : `${formatted} ${symbol}`;
    } catch {
      return row.amount;
    }
  }

  function rowDateLabel(row: PaymentRow): string {
    if (row.createdAt === null || row.createdAt === "") return "—";
    const d = new Date(row.createdAt);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(dateLocale);
  }

  function shortSig(sig: string): string {
    return sig.length > 14 ? `${sig.slice(0, 8)}…${sig.slice(-4)}` : sig;
  }
</script>

<div class="glass min-w-0 p-6 sm:p-8">
  <h2 class="text-lg font-bold" data-i18n="pmpanel.title">Payment links &amp; one-time</h2>
  <p class="mt-1 text-sm text-white/55" data-i18n="pmpanel.lead">
    Generate a shareable one-time payment link or widget snippet, then watch confirmed transfers land. Every row was
    verified on-chain before it was stored.
  </p>

  {#if demo}
    <p class="mt-4 rounded-xl bg-[#ff3b69]/10 p-3 font-mono text-[11px] text-[#ffb4ab]" data-i18n="pmpanel.demoNote">
      Demo mode — one-time payments need a live backend and wallet.
    </p>
  {:else}
    <form class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2" onsubmit={(e) => e.preventDefault()}>
      <label class="flex min-w-0 flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70" data-i18n="pmpanel.amountLabel">Amount</span>
        <input
          id="pm-amount"
          class="field pm-amount w-full min-w-0 px-3.5 py-2.5 font-mono"
          placeholder="e.g. 5.00"
          data-i18n-ph="pmpanel.amountPh"
          bind:value={amountUi}
          inputmode="decimal"
          spellcheck={false}
          aria-invalid={amountUi.trim() !== "" && rawAmount === null}
          aria-describedby={amountUi.trim() !== "" && rawAmount === null ? "pm-amount-err" : undefined}
        />
        {#if amountUi.trim() !== "" && rawAmount === null}
          <span id="pm-amount-err" class="pm-err" role="alert">{$t("pmpanel.badAmount")}</span>
        {/if}
      </label>
      <label class="flex min-w-0 flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70" data-i18n="pmpanel.tokenLabel">Token</span>
        <select class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs" bind:value={tokenChoice}>
          <option value="sol" data-i18n="pmpanel.tokenSol">SOL · native</option>
          {#each KNOWN_MINTS as km (km.mint)}
            {#if km.mint === CUSTOM_MINT}
              <option value={CUSTOM_MINT} data-i18n="pmpanel.tokenCustom">Custom mint…</option>
            {:else}
              <option value={km.mint}>{km.label}</option>
            {/if}
          {/each}
        </select>
      </label>
      {#if tokenChoice === CUSTOM_MINT}
        <label class="flex min-w-0 flex-col gap-1.5 text-sm sm:col-span-2">
          <span class="font-medium text-white/70" data-i18n="pmpanel.customMintLabel">Mint address</span>
          <input
            id="pm-mint"
            class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs"
            placeholder="Base58 mint address…"
            data-i18n-ph="pmpanel.customMintPh"
            bind:value={customMint}
            spellcheck={false}
            aria-invalid={customMint.trim() !== "" && !customMintValid}
            aria-describedby={customMint.trim() !== "" && !customMintValid ? "pm-mint-err" : undefined}
          />
          {#if customMint.trim() !== "" && !customMintValid}
            <span id="pm-mint-err" class="pm-err" role="alert">{$t("pmpanel.badMint")}</span>
          {/if}
        </label>
        <label class="flex min-w-0 flex-col gap-1.5 text-sm">
          <span class="font-medium text-white/70" data-i18n="pmpanel.decimalsLabel">Decimals</span>
          <input
            id="pm-decimals"
            class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs"
            bind:value={customDecimals}
            inputmode="numeric"
            spellcheck={false}
            aria-invalid={decimals === null}
            aria-describedby={decimals === null ? "pm-decimals-err" : undefined}
          />
          {#if decimals === null}
            <span id="pm-decimals-err" class="pm-err" role="alert">{$t("pmpanel.badDecimals")}</span>
          {/if}
        </label>
      {/if}
      <label class="flex min-w-0 flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70">
          <span data-i18n="pmpanel.labelLabel">Label</span> <span class="text-white/35" data-i18n="pmpanel.optional">(optional)</span>
        </span>
        <input
          class="field w-full min-w-0 px-3.5 py-2.5 text-sm"
          data-i18n-ph="pmpanel.labelPh" placeholder="e.g. Coffee · tip jar"
          bind:value={labelText}
          maxlength={120}
        />
      </label>
    </form>

    {#if merchant === null}
      <p class="mt-3 text-sm text-white/40" data-i18n="pmpanel.connectFirst">Connect your wallet to generate a payment link.</p>
    {:else if payUrl !== ""}
      <div class="mt-4 space-y-3">
        <div class="min-w-0">
          <p class="text-xs font-medium text-white/60" data-i18n="pmpanel.linkLabel">Payment link</p>
          <pre class="codeblock mt-2 min-w-0">{payUrl}</pre>
          <div class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="btn-ghost cursor-pointer rounded-lg px-4 py-2 text-xs font-bold"
              onclick={() => void copyText(payUrl, $t("pmpanel.linkLabel"))}
            >
              {$t("pmpanel.copy")}
            </button>
            <a href={payUrl} target="_blank" rel="noreferrer" class="btn-ghost rounded-lg px-4 py-2 text-xs font-bold">
              {$t("pmpanel.openPay")}
            </a>
          </div>
        </div>
        <div class="min-w-0">
          <p class="text-xs font-medium text-white/60" data-i18n="pmpanel.snippetLabel">Widget snippet</p>
          <pre class="codeblock mt-2 min-w-0">{snippet}</pre>
          <button
            type="button"
            class="btn-ghost mt-2 cursor-pointer rounded-lg px-4 py-2 text-xs font-bold"
            onclick={() => void copyText(snippet, $t("pmpanel.snippetLabel"))}
          >
            {$t("pmpanel.copy")}
          </button>
        </div>
      </div>
    {/if}

    <div class="mt-6 flex min-w-0 flex-wrap items-center justify-between gap-2">
      <h3 class="text-sm font-bold" data-i18n="pmpanel.listTitle">Recorded one-time payments</h3>
      <button
        class="cursor-pointer font-mono text-[11px] text-[#7df4ff] underline transition-colors hover:text-[#00f0ff] disabled:opacity-40"
        onclick={() => void refresh()}
        disabled={loading || merchant === null}
      >
        {loading ? $t("port2.form.refreshing") : $t("invoice.refresh")}
      </button>
    </div>
    {#if merchant === null}
      <p class="mt-2 text-sm text-white/40" data-i18n="pmpanel.connectFirst">Connect your wallet to generate a payment link.</p>
    {:else if payments.length === 0}
      <p class="mt-2 text-sm text-white/40" data-i18n="pmpanel.empty">No payments recorded yet — share your link to receive the first one.</p>
    {:else}
      <div class="mt-3 min-w-0 overflow-x-auto rounded-xl border border-white/[0.08]">
        <table class="table-void table-stack min-w-[560px] max-md:min-w-0">
          <thead>
            <tr>
              <th data-i18n="pmpanel.colDate">Date</th>
              <th data-i18n="pmpanel.colAmount">Amount</th>
              <th data-i18n="pmpanel.colMemo">Memo</th>
              <th data-i18n="pmpanel.colSignature">Signature</th>
            </tr>
          </thead>
          <tbody>
            {#each payments as row (row.id)}
              <tr>
                <td data-label={$t("pmpanel.colDate")} class="font-mono text-white/60">{rowDateLabel(row)}</td>
                <td data-label={$t("pmpanel.colAmount")} class="font-mono text-white/85">{rowAmountLabel(row)}</td>
                <td data-label={$t("pmpanel.colMemo")} class="min-w-0 max-w-[220px] truncate font-mono text-white/55" title={row.memo ?? undefined}>
                  {row.memo ?? "—"}
                </td>
                <td data-label={$t("pmpanel.colSignature")}>
                  <a
                    class="font-mono text-[11px] break-all text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]"
                    href={explorerTxUrl(row.signature)}
                    target="_blank"
                    rel="noreferrer"
                    title={row.signature}
                  >
                    {shortSig(row.signature)}
                  </a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</div>
<style>
  /* Funnel pass: hero amount + field-adjacent errors (coral per DESIGN.md). */
  .pm-amount {
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .pm-err {
    font-size: 12px;
    line-height: 16px;
    color: #ffb4ab;
  }
</style>
