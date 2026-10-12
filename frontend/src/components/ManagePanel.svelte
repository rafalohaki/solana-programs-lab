<script lang="ts">
  import { getAssociatedTokenAddressSync, createRevokeInstruction, getAccount } from "@solana/spl-token";
  import { PublicKey, Transaction, type Connection } from "@solana/web3.js";
  import type { Plan, Subscription } from "../lib/chain.js";
  import { connection, decodePlan, explorerTxUrl, fetchMintDecimals, fetchSubscriptionsOf, formatTokenAmount, shortAddr } from "../lib/chain.js";
  import { toast } from "../lib/ui.js";
  import { signAndSendAction, wallet, type SolanaProvider } from "../lib/wallet.js";
  import { applyStaticLang, getLang, lang, t } from "../lib/i18n.js";
  import { DEMO_PLANS, isDemoMode } from "../lib/demo.js";
  import { parseUiAmountToRaw } from "../lib/mints.js";
  import "../lib/i18n-port3.js";
  import { onMount, tick } from "svelte";
  import Countdown from "./Countdown.svelte";
  import { recordLocalReceipt } from "./ReceiptHistory.svelte";
  import SubscriptionCard, { type CardAllowance } from "./SubscriptionCard.svelte";

  interface Row {
    sub: Subscription;
    plan: Plan | null;
    decimals: number;
  }

  let rows: Row[] = $state([]);
  let loading = $state(false);
  let loadError: string | null = $state(null);
  let busySub: string | null = $state(null);
  let busyKind: "cancel" | "charge" | null = $state(null);
  let lastWallet: string | null = $state(null);

  /** On-chain SPL delegate state per subscription address. undefined = read in flight. */
  let allowances: Record<string, CardAllowance | null | undefined> = $state({});

  let killArmed = $state(false);
  let killBusy = $state(false);
  let armTimer: number | null = $state(null);

  /** Demo mode (parent contract): fixtures INSTEAD of chain fetches. */
  const demo = typeof window !== "undefined" && isDemoMode();

  function demoKey(seed: number): PublicKey {
    const bytes = new Uint8Array(32);
    bytes[0] = seed;
    bytes[31] = seed;
    return new PublicKey(bytes);
  }

  /** Demo rows derived ONLY from DEMO_PLANS + Date.now() (due now → "payment due"). */
  function buildDemoRows(): { rows: Row[]; allowances: Record<string, CardAllowance | null> } {
    const nowSec = Math.floor(Date.now() / 1000);
    const next: Row[] = [];
    const allow: Record<string, CardAllowance | null> = {};
    DEMO_PLANS.forEach((p, i) => {
      const seed = 11 + i;
      const decimals = p.mintSymbol === "SOL" ? 9 : 6;
      const amount = parseUiAmountToRaw(p.amountUi, decimals) ?? 0n;
      const plan: Plan = {
        address: demoKey(seed),
        merchant: demoKey(100 + seed),
        mint: demoKey(200 + seed),
        amount,
        periodSeconds: BigInt(p.periodSeconds),
        planId: BigInt(p.planId),
        bump: 0,
      };
      const sub: Subscription = {
        address: demoKey(40 + seed),
        plan: plan.address,
        subscriber: demoKey(150 + seed),
        lastPaidAt: BigInt(nowSec) - BigInt(p.periodSeconds),
        status: "active",
        bump: 0,
      };
      next.push({ sub, plan, decimals });
      allow[sub.address.toBase58()] = { amount, delegate: p.address };
    });
    return { rows: next, allowances: allow };
  }

  onMount(() => {
    void refresh();
  });

  // Auto-refresh when the wallet (dis)connects.
  $effect(() => {
    const current = $wallet.address?.toBase58() ?? null;
    if (current !== lastWallet) {
      lastWallet = current;
      void refresh();
    }
  });

  // Static `data-i18n` nodes in this island (and its cards) can mount after
  // the last dictionary-driven applyStaticLang pass — async rows land later
  // still — so re-apply whenever the rendered branch or row set changes.
  $effect(() => {
    $wallet.address;
    loading;
    loadError;
    rows;
    $lang;
    void tick().then(() => applyStaticLang(getLang()));
  });

  // ---- derived status-bar values (all from chain reads, never hardcoded) ----
  const activeRows = $derived(rows.filter((r) => r.sub.status === "active"));
  const activeCount = $derived(activeRows.length);
  const delegateActive = $derived(
    activeRows.some((r) => (allowances[r.sub.address.toBase58()]?.amount ?? 0n) > 0n),
  );
  /** Absolute unix of the closest upcoming charge (chain: lastPaidAt + period). */
  const nearestTarget = $derived.by((): number | null => {
    let best: number | null = null;
    for (const r of activeRows) {
      if (r.plan === null) continue;
      const dueAt = Number(r.sub.lastPaidAt) + Number(r.plan.periodSeconds);
      if (best === null || dueAt < best) best = dueAt;
    }
    return best;
  });
  const walletShort = $derived($wallet.address === null ? "–" : shortAddr($wallet.address));
  /** Active allowances only — drives the emerald/idle chip, no mocks. */
  const cappedCount = $derived(
    activeRows.filter((r) => (allowances[r.sub.address.toBase58()]?.amount ?? 0n) > 0n).length,
  );
  /** Per-mint sums aggregated from the cards above (rows + allowances, zero new reads). */
  interface MintCap {
    mint: string;
    decimals: number;
    perPeriod: bigint;
    allowed: bigint;
    plans: number;
  }
  const mintCaps = $derived.by((): MintCap[] => {
    const map = new Map<string, MintCap>();
    for (const r of activeRows) {
      if (r.plan === null) continue;
      const key = r.plan.mint.toBase58();
      const cur = map.get(key) ?? { mint: key, decimals: r.decimals, perPeriod: 0n, allowed: 0n, plans: 0 };
      cur.perPeriod += r.plan.amount;
      cur.plans += 1;
      const a = allowances[r.sub.address.toBase58()];
      if (a !== undefined && a !== null) cur.allowed += a.amount;
      map.set(key, cur);
    }
    return [...map.values()];
  });
  const mintShort = (mint: string): string => `${mint.slice(0, 4)}…${mint.slice(-4)}`;

  function actionEndpoint(kind: "cancel" | "charge", row: Row): string {
    const qs = new URLSearchParams({
      plan: row.sub.plan.toBase58(),
      mint: row.plan?.mint.toBase58() ?? "",
      cluster: import.meta.env.PUBLIC_SOLANA_CLUSTER,
      programId: import.meta.env.PUBLIC_SUBSCRIPTIONS_PROGRAM_ID,
    });
    if (kind === "charge" && row.plan !== null) {
      qs.set("subscriber", row.sub.subscriber.toBase58());
      qs.set("merchant", row.plan.merchant.toBase58());
    }
    return `/api/actions/${kind}?${qs.toString()}`;
  }

  async function refresh(): Promise<void> {
    // DEMO MODE (parent contract): fixtures instead of any fetch.
    if (demo) {
      const built = buildDemoRows();
      rows = built.rows;
      allowances = built.allowances;
      loading = false;
      loadError = null;
      return;
    }
    const address = $wallet.address;
    rows = [];
    allowances = {};
    if (address === null) return;
    loading = true;
    loadError = null;
    try {
      const conn = connection();
      const subs = await fetchSubscriptionsOf(conn, address);
      const next: Row[] = [];
      await Promise.all(
        subs.map(async (sub) => {
          const info = await conn.getAccountInfo(sub.plan);
          const plan = info === null ? null : decodePlan(sub.plan, new Uint8Array(info.data));
          const decimals = plan === null ? 6 : await fetchMintDecimals(conn, plan.mint);
          next.push({ sub, plan, decimals });
        }),
      );
      next.sort((a, b) => Number(b.sub.lastPaidAt - a.sub.lastPaidAt));
      rows = next;
      void refreshAllowances(conn);
    } catch (err) {
      loadError = err instanceof Error ? err.message : $t("manage.loadFail");
    } finally {
      loading = false;
    }
  }

  /** One spl-token getAccount read per active subscription ATA — real delegatedAmount. */
  async function refreshAllowances(conn: Connection): Promise<void> {
    const snapshot = rows;
    const entries = await Promise.all(
      snapshot.map(async (row): Promise<[string, CardAllowance | null]> => {
        const key = row.sub.address.toBase58();
        if (row.plan === null) return [key, null];
        try {
          const ata = getAssociatedTokenAddressSync(row.plan.mint, row.sub.subscriber);
          const acc = await getAccount(conn, ata);
          if (acc.delegatedAmount === 0n) return [key, null];
          const delegate = acc.delegate === null ? null : acc.delegate.toBase58();
          return [key, { amount: acc.delegatedAmount, delegate }];
        } catch {
          // No ATA / closed account / RPC hiccup — honestly shown as "none".
          return [key, null];
        }
      }),
    );
    const next: Record<string, CardAllowance | null | undefined> = {};
    for (const [key, value] of entries) next[key] = value;
    allowances = next;
  }

  async function runAction(kind: "cancel" | "charge", row: Row): Promise<void> {
    // DEMO MODE: fixtures are display-only — never send a real transaction.
    if (demo) {
      toast.info("Demo mode", { body: "Connect a wallet with demo off to send a real transaction." });
      return;
    }
    const key = row.sub.address.toBase58();
    busySub = key;
    busyKind = kind;
    try {
      const { signature } = await signAndSendAction(actionEndpoint(kind, row));
      if (kind === "charge" && row.plan !== null && $wallet.address !== null) {
        // Device-local receipt: no per-wallet aggregation endpoint exists,
        // so the browser that saw the confirmation keeps the record.
        recordLocalReceipt({
          signature,
          label: `plan #${row.plan.planId.toString()} · ${formatTokenAmount(row.plan.amount, row.decimals)}`,
          amountRaw: row.plan.amount.toString(),
          decimals: row.decimals,
          ts: Date.now(),
          wallet: $wallet.address.toBase58(),
        });
        toast.ok($t("receipt.recorded"), {
          body: signature,
          link: { label: $t("manage.viewInExplorer"), href: explorerTxUrl(signature) },
        });
      } else {
        toast.ok(kind === "cancel" ? $t("manage.cancelled") : $t("manage.charged"), {
          body: signature,
          link: { label: $t("manage.viewInExplorer"), href: explorerTxUrl(signature) },
        });
      }
      await refresh();
    } catch (err) {
      toast.err(kind === "cancel" ? $t("manage.cancelFail") : $t("manage.chargeFail"), {
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      busySub = null;
      busyKind = null;
    }
  }

  // ---- emergency kill-switch: ONE local tx with N x revoke, no program ----
  function localProvider(): SolanaProvider | null {
    if (typeof window === "undefined") return null;
    const w = window as unknown as { solana?: SolanaProvider; solflare?: SolanaProvider };
    const name = $wallet.name;
    if (name === "solflare") return w.solflare ?? null;
    return w.solana ?? null;
  }

  async function confirmSignature(conn: Connection, signature: string): Promise<void> {
    const deadline = Date.now() + 60_000;
    for (;;) {
      const { value } = await conn.getSignatureStatuses([signature]);
      const status = value[0];
      if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return;
      const err = status?.err;
      if (err !== null && err !== undefined) throw new Error(`Transaction rejected on-chain: ${JSON.stringify(err)}`);
      if (Date.now() > deadline) throw new Error("Confirmation timed out (60 s). Check the signature in the Explorer.");
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    }
  }

  function disarm(): void {
    killArmed = false;
    if (armTimer !== null) {
      window.clearTimeout(armTimer);
      armTimer = null;
    }
  }

  async function killAll(): Promise<void> {
    if (killBusy) return;
    // DEMO MODE: fixtures are display-only — never send a real transaction.
    if (demo) {
      toast.info("Demo mode", { body: "Connect a wallet with demo off to send a real transaction." });
      return;
    }
    if (!killArmed) {
      killArmed = true;
      if (armTimer !== null) window.clearTimeout(armTimer);
      armTimer = window.setTimeout(() => disarm(), 6000);
      return;
    }
    disarm();
    const owner: PublicKey | null = $wallet.address;
    if (owner === null) {
      toast.err($t("manage2.killNoWallet"), {});
      return;
    }
    const provider = localProvider();
    if (provider === null) {
      toast.err($t("manage2.killNoWallet"), {});
      return;
    }
    const targets = activeRows.filter((r) => r.plan !== null);
    if (targets.length === 0) {
      toast.err($t("manage2.killEmpty"), {});
      return;
    }
    killBusy = true;
    try {
      const conn = connection();
      const { blockhash } = await conn.getLatestBlockhash("confirmed");
      const tx = new Transaction({ feePayer: owner, recentBlockhash: blockhash });
      for (const row of targets) {
        if (row.plan === null) continue;
        const ata = getAssociatedTokenAddressSync(row.plan.mint, row.sub.subscriber);
        tx.add(createRevokeInstruction(ata, owner));
      }
      // Revoke is idempotent: already-empty allowances confirm as no-ops,
      // so every active subscription ATA is included unconditionally.
      const signed = await provider.signTransaction(tx);
      const raw = signed.serialize();
      const signature = await conn.sendRawTransaction(raw, { skipPreflight: false });
      await confirmSignature(conn, signature);
      toast.ok($t("manage2.killed"), {
        body: signature,
        link: { label: $t("manage.viewInExplorer"), href: explorerTxUrl(signature) },
      });
      await refresh();
    } catch (err) {
      toast.err($t("manage2.killFail"), {
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      killBusy = false;
    }
  }
</script>

  <!-- Status bar (Stitch telemetry): every number comes from chain reads above. -->
  <div class="glass relative overflow-hidden rounded-2xl p-4 sm:p-6">
    <div class="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#9945ff]/[0.07] via-transparent to-[#14f195]/[0.07]"></div>
    <div class="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-3">
          <!-- Delegate state chip: design-system classes only — .chip-active
               carries its own pulse dot; idle uses the neutral pill variant
               (no ad-hoc animate-ping ring). -->
          {#if delegateActive}
            <span class="chip-active">{$t("manage2.delegateActive")}</span>
          {:else}
            <span class="tag-pill tag-pill--idle">{$t("manage2.delegateIdle")}</span>
          {/if}
          <span class="font-mono text-[11px] tracking-[0.06em] text-white/35 uppercase" data-i18n="manage2.engine"
            >SPL-Token rule engine</span
          >
        </div>
        <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-white/55 tabular-nums">
          <span class="font-mono text-xs text-white/80">{walletShort}</span>
          <span class="text-white/25">/</span>
          <span><strong class="font-semibold text-white">{activeCount}</strong> {$t("port3.programs")}</span>
          <span class="text-white/25">/</span>
          <span class="text-[#14f195]" data-i18n="manage2.zeroCustody">Zero-custody: funds stay in your wallet until each charge.</span>
        </p>
      </div>
      <button
        class="w-full cursor-pointer rounded-xl border border-[#ff3b69]/30 bg-[#93000a] px-5 py-3 text-sm font-bold text-[#ffdad6] shadow-[0_0_24px_rgba(147,0,10,0.45)] transition hover:brightness-125 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60 lg:w-auto"
        disabled={killBusy || activeCount === 0}
        onclick={() => void killAll()}
        title={$t("manage2.killHint")}
      >
        {#if killBusy}
          {$t("manage2.killWorking")}
        {:else if killArmed}
          {$t("manage2.killArm")} ({activeCount})
        {:else}
          <span data-i18n="manage2.kill">Emergency kill-switch</span>
        {/if}
      </button>
    </div>
    <div class="relative z-10 mt-5 grid grid-cols-1 gap-3 rounded-xl bg-black/25 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <div class="flex min-w-0 flex-col">
        <span class="font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase" data-i18n="port3.programs">active subscriptions</span>
        <span class="font-display mt-1 text-xl font-bold text-white tabular-nums">
          {activeCount} <span class="text-sm font-medium text-white/45">/ {rows.length} {$t("port3.total")}</span>
        </span>
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase" data-i18n="port3.allowanceState">SPL delegate allowance</span>
        {#if cappedCount > 0}
          <span class="font-display mt-1 text-xl font-bold text-[#14f195]" data-i18n="port3.allowanceCapped">Limited (max cap)</span>
        {:else}
          <span class="font-display mt-1 text-xl font-bold text-white/40" data-i18n="port3.allowanceNone">none on-chain</span>
        {/if}
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase">
          <span data-i18n="manage2.nextCharge">closest charge</span>
        </span>
        <span class="mt-1">
          {#if nearestTarget === null}
            <span class="text-sm text-white/45" data-i18n="manage2.noCharges">no upcoming charges</span>
          {:else}
            <Countdown targetUnix={nearestTarget} />
          {/if}
        </span>
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="font-mono text-[11px] font-medium tracking-[0.06em] text-white/40 uppercase" data-i18n="manage2.programStatus">program status</span>
        <span
          class="font-display mt-1 text-xl font-bold text-[#7df4ff]"
          data-i18n="manage2.anchorVerified"
          data-i18n-title="manage2.anchorTitle"
        >
          Program: Anchor IDL verified
        </span>
      </div>
    </div>
  </div>

{#if !demo && $wallet.address === null}
  <div class="glass mt-4 rounded-2xl p-10 text-center">
    <span class="msym mx-auto mb-3 block text-[32px] text-white/30" aria-hidden="true">account_balance_wallet</span>
    <p class="font-display text-lg font-bold" data-i18n="manage.connectTitle">Connect your wallet</p>
    <p class="mt-1 text-sm text-white/55" data-i18n="manage.connectBody">
      Your subscriptions appear here once you connect a wallet above.
    </p>
  </div>
{:else if loading}
  <div class="mt-4 grid gap-4 sm:grid-cols-2">
    {#each [0, 1] as i (i)}
      <div class="skeleton h-60 rounded-2xl"></div>
    {/each}
  </div>
{:else if loadError !== null}
  <div class="glass mt-4 rounded-2xl p-8 text-center">
    <span class="msym mx-auto mb-3 block text-[32px] text-[#ff3b69]/70" aria-hidden="true">cloud_off</span>
    <p class="text-sm font-semibold text-[#ff3b69]" data-i18n="manage.readError">Read error</p>
    <p class="mt-1 font-mono text-xs break-all text-white/50">{loadError}</p>
    <button class="btn-ghost mt-4 cursor-pointer px-4 py-2 text-sm" onclick={() => void refresh()} data-i18n="manage.retry">
      Try again
    </button>
  </div>
{:else if rows.length === 0}
  <div class="glass mt-4 rounded-2xl p-10 text-center">
    <span class="msym mx-auto mb-3 block text-[32px] text-white/30" aria-hidden="true">subscriptions</span>
    <p class="font-display text-lg font-bold" data-i18n="manage.emptyTitle">No subscriptions</p>
    <p class="mt-1 text-sm text-white/55">
      <span data-i18n="manage.emptyLead">This wallet is not subscribed to any plan. Pick a plan on the</span>
      <a class="text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]" href="/"><span data-i18n="manage.emptyHome">homepage</span></a>.
    </p>
  </div>
  {:else}
  <div class="mt-6 grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
    <div class="flex flex-col gap-4 lg:col-span-8">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-display text-lg font-bold tracking-tight">
          {activeCount} {$t("manage2.activeSubs")}
          <span class="ml-2 rounded-full bg-white/5 px-2.5 py-0.5 align-middle font-mono text-[11px] font-medium tracking-[0.06em] text-[#d8b9ff] uppercase">
            {activeCount} {$t("port3.live")}
          </span>
        </h2>
        <span class="font-mono text-[11px] tracking-[0.06em] text-white/35 uppercase" data-i18n="manage2.engine">SPL-Token rule engine</span>
      </div>
      {#each rows as row (row.sub.address.toBase58())}
        <SubscriptionCard
          sub={row.sub}
          plan={row.plan}
          decimals={row.decimals}
          allowance={allowances[row.sub.address.toBase58()]}
          isMerchant={row.plan !== null &&
            $wallet.address !== null &&
            row.plan.merchant.equals($wallet.address)}
          busy={busySub === row.sub.address.toBase58()}
          {busyKind}
          onCancel={(s) => {
            const found = rows.find((r) => r.sub.address.equals(s.address));
            if (found !== undefined) void runAction("cancel", found);
          }}
          onCharge={(s) => {
            const found = rows.find((r) => r.sub.address.equals(s.address));
            if (found !== undefined) void runAction("charge", found);
          }}
        />
      {/each}
    </div>
    <aside class="flex flex-col gap-4 lg:col-span-4">
      <div class="glass rounded-2xl p-5">
        <p class="font-display text-base font-bold text-white" data-i18n="port3.custodyTitle">Model B: SPL delegations</p>
        <p class="mt-0.5 font-mono text-[11px] font-medium tracking-[0.06em] text-[#14f195] uppercase" data-i18n="port3.custodyArch">
          100% non-custodial architecture
        </p>
        <p class="mt-3 text-sm leading-relaxed text-white/55" data-i18n="port3.custodyBody">
          Your tokens never leave your wallet before the billing slot arrives. The program only holds a capped delegation.
        </p>
        <ul class="mt-3 space-y-2 text-[13px] leading-snug text-white/75">
          <li class="flex items-start gap-2"><span class="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#14f195]"></span><span data-i18n="port3.custodyP1">Revoke consent in one click, no provider questions.</span></li>
          <li class="flex items-start gap-2"><span class="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#14f195]"></span><span data-i18n="port3.custodyP2">A charge before its slot fails the program's clock check (now ≥ last_paid_at + period); the token program separately rejects anything above the delegate cap.</span></li>
          <li class="flex items-start gap-2"><span class="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#14f195]"></span><span data-i18n="port3.custodyP3">Every paid invoice leaves a 32-byte memo_hash in the invoice account — a receipt an auditor can replay from the ledger.</span></li>
        </ul>
      </div>
      <div class="glass rounded-2xl p-5">
        <p class="font-display text-base font-bold text-white" data-i18n="port3.limitsTitle">Active SPL delegation caps</p>
        <p class="mt-0.5 text-xs text-white/45" data-i18n="port3.limitsLead">Summed from the cards on this page — no extra reads.</p>
        {#if mintCaps.length === 0}
          <p class="mt-3 text-sm text-white/45" data-i18n="port3.limitsEmpty">No active allowances yet — subscribe to a plan on the homepage and the cap appears here.</p>
        {:else}
          <ul class="mt-3 space-y-2">
            {#each mintCaps as cap (cap.mint)}
              <li class="flex items-center justify-between gap-2 rounded-xl bg-white/[0.03] px-3.5 py-2.5">
                <div class="flex items-center gap-2">
                  <span class="inline-block h-2 w-2 shrink-0 rounded-full bg-[#9945ff]"></span>
                  <span class="font-mono text-xs text-white/80">{mintShort(cap.mint)}</span>
                  <span class="font-mono text-[10px] tracking-[0.06em] text-white/35 uppercase">· {cap.plans} {$t("port3.programs")}</span>
                </div>
                <div class="text-right">
                  <p class="font-mono text-sm font-semibold text-white tabular-nums">{formatTokenAmount(cap.perPeriod, cap.decimals)}</p>
                  <p class="font-mono text-[10px] tracking-[0.06em] text-white/35 uppercase"><span data-i18n="port3.perPeriod">per period</span> · <span class="text-[#14f195]">{formatTokenAmount(cap.allowed, cap.decimals)} <span data-i18n="port3.allowedNow">allowed now</span></span></p>
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </aside>
  </div>
{/if}
