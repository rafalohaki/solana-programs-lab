<script lang="ts">
  import { PublicKey } from "@solana/web3.js";
  import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
  import {
    CLUSTER,
    PROGRAM_ID,
    connection,
    explorerTxUrl,
    fetchMintDecimals,
    findPlanPda,
    formatPeriod,
    shortAddr,
  } from "../lib/chain.js";
  import {
    CUSTOM_MINT,
    DEVNET_USDC_MINT,
    KNOWN_MINTS,
    decimalsFor,
    parseUiAmountToRaw,
  } from "../lib/mints.js";
  import { toast } from "../lib/ui.js";
  import { signAndSendAction, wallet } from "../lib/wallet.js";
  import { lang, t } from "../lib/i18n.js";
  import {
    META_DESCRIPTION_MAX,
    META_TITLE_MAX,
    PLAN_CATEGORIES,
    planCategoryKey,
    publishPlanMeta,
    type PlanCategory,
  } from "../lib/plansMeta.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-home2.js";
  import "../lib/i18n-merch2.js";
  import "../lib/i18n-port2.js";

  const PERIOD_PRESETS = [
    { id: "day", labelKey: "mform.presetDay", seconds: 86400 },
    { id: "week", labelKey: "mform.presetWeek", seconds: 604800 },
    { id: "month", labelKey: "mform.presetMonth", seconds: 2592000 },
    { id: "quarter", labelKey: "mform.presetQuarter", seconds: 7776000 },
    { id: "custom", labelKey: "mform.presetCustom", seconds: 0 },
  ] as const;

  type PresetId = (typeof PERIOD_PRESETS)[number]["id"];

  let planId = $state("1");
  let mintChoice = $state(DEVNET_USDC_MINT);
  let customMint = $state("");
  let customDecimals = $state("6");
  let chainDecimals = $state<number | null>(null);
  let detecting = $state(false);
  let amountUi = $state("10");
  let periodPreset = $state<PresetId>("month");
  let customSeconds = $state("2592000");
  let busy = $state(false);

  // Optional merchant-DECLARED display metadata (plan card copy). Published
  // separately AFTER the on-chain create is confirmed — the backend binds the
  // row to the plan PDA only after re-verifying on-chain ownership.
  let metaTitle = $state("");
  let metaDescription = $state("");
  let metaCategory = $state<"none" | PlanCategory>("none");
  let metaBusy = $state(false);

  const effectiveMint = $derived(mintChoice === CUSTOM_MINT ? customMint.trim() : mintChoice);
  const listDecimals = $derived(mintChoice === CUSTOM_MINT ? null : decimalsFor(mintChoice));
  const effectiveDecimals = $derived(
    mintChoice === CUSTOM_MINT ? Number(customDecimals) : (chainDecimals ?? listDecimals ?? 6),
  );
  const decimalsValid = $derived(
    Number.isInteger(effectiveDecimals) && effectiveDecimals >= 0 && effectiveDecimals <= 9,
  );
  const rawAmount = $derived(decimalsValid ? parseUiAmountToRaw(amountUi, effectiveDecimals) : null);
  const periodSeconds = $derived(
    periodPreset === "custom"
      ? Number(customSeconds)
      : (PERIOD_PRESETS.find((p) => p.id === periodPreset)?.seconds ?? 0),
  );

  const mintValid = $derived.by(() => {
    try {
      new PublicKey(effectiveMint);
      return true;
    } catch {
      return false;
    }
  });

  const planPdaPreview = $derived.by(() => {
    const merchant = $wallet.address;
    if (merchant === null || !/^\d+$/.test(planId.trim())) return null;
    try {
      return findPlanPda(merchant, BigInt(planId.trim()))[0].toBase58();
    } catch {
      return null;
    }
  });

  const formValid = $derived(
    $wallet.address !== null &&
      /^\d+$/.test(planId.trim()) &&
      mintValid &&
      rawAmount !== null &&
      Number.isFinite(periodSeconds) &&
      periodSeconds >= 30,
  );

  /** At least one metadata field is declared → publish after the create tx. */
  const metaDirty = $derived(
    metaTitle.trim() !== "" || metaDescription.trim() !== "" || metaCategory !== "none",
  );

  // --- Subscriber preview card: pure $derived reads of the inputs above. ---
  const mintSymbol = $derived(
    KNOWN_MINTS.find((m) => m.mint === mintChoice && m.mint !== CUSTOM_MINT)?.symbol ?? "units",
  );
  const previewPeriod = $derived(
    Number.isFinite(periodSeconds) && periodSeconds >= 30
      ? formatPeriod(BigInt(Math.floor(periodSeconds)), $lang)
      : "—",
  );
  const delegateLimit = $derived(rawAmount !== null ? `${rawAmount.toString()} units` : "—");

  // Confirm list decimals against the chain whenever the chosen mint changes.
  $effect(() => {
    const mintAddr = effectiveMint;
    const isCustom = mintChoice === CUSTOM_MINT;
    if (isCustom) return;
    let cancelled = false;
    let key: PublicKey;
    try {
      key = new PublicKey(mintAddr);
    } catch {
      chainDecimals = null;
      return;
    }
    void fetchMintDecimals(connection(), key).then((d) => {
      if (!cancelled) chainDecimals = d;
    });
    return () => {
      cancelled = true;
    };
  });

  async function detectCustomDecimals(): Promise<void> {
    let key: PublicKey;
    try {
      key = new PublicKey(effectiveMint);
    } catch {
      toast.err($t("mform.detectFail"), { body: $t("mform.checkMint") });
      return;
    }
    detecting = true;
    try {
      const info = await connection().getAccountInfo(key);
      if (!info) {
        toast.err($t("mform.detectFail"), { body: $t("mform.mintMissing") });
        return;
      }
      // Only a real SPL mint carries decimals at byte 44 of the 82-byte Mint
      // layout. Any other account (e.g. a 165-byte token account) would yield
      // a garbage byte here — reject it instead of surfacing a wrong amount
      // in create-plan. Never convert a failed read into a silent default.
      if (info.owner.toBase58() !== TOKEN_PROGRAM_ID.toBase58() || info.data.length !== 82) {
        toast.err($t("mform.detectFail"), { body: $t("mform.checkMint") });
        return;
      }
      // Length checked above — byte 44 exists; `?? 0` only satisfies
      // noUncheckedIndexedAccess and is unreachable at runtime.
      customDecimals = String(info.data[44] ?? 0);
    } catch (err) {
      toast.err($t("mform.detectFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      detecting = false;
    }
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const merchant = $wallet.address;
    if (merchant === null) {
      toast.err($t("mform.noWallet"), { body: $t("mform.noWalletBody") });
      return;
    }
    if (rawAmount === null) {
      toast.err($t("mform.badAmount"), { body: $t("mform.badAmountBody") });
      return;
    }
    const qs = new URLSearchParams({
      merchant: merchant.toBase58(),
      planId: planId.trim(),
      mint: effectiveMint,
      amount: rawAmount.toString(),
      period: Math.floor(periodSeconds).toString(),
      cluster: CLUSTER,
      programId: PROGRAM_ID.toBase58(),
    });
    busy = true;
    try {
      const { signature } = await signAndSendAction(`/api/actions/plan?${qs.toString()}`);
      toast.ok($t("mform.created"), {
        body: signature,
        link: { label: $t("mform.viewInExplorer"), href: explorerTxUrl(signature) },
      });
      // Optional metadata publish AFTER the confirmed create: the backend
      // re-reads the plan account on-chain and binds the row to its real
      // owner, so this can only succeed once the plan actually exists.
      // Failure never negates the created plan — it is reported honestly and
      // the copy can be (re)published with the next create/save.
      if (metaDirty) {
        metaBusy = true;
        try {
          const [pda] = findPlanPda(merchant, BigInt(planId.trim()));
          await publishPlanMeta({
            merchant: merchant.toBase58(),
            plan: pda.toBase58(),
            title: metaTitle,
            description: metaDescription,
            category: metaCategory === "none" ? "" : metaCategory,
            handle: "",
          });
          toast.ok($t("home2.meta.saved"));
        } catch (metaErr) {
          toast.err($t("home2.meta.fail"), {
            body: metaErr instanceof Error ? metaErr.message : undefined,
          });
        } finally {
          metaBusy = false;
        }
      }
      // Fired after the metadata attempt so a grid refresh sees both the new
      // plan and its declared copy.
      window.dispatchEvent(new CustomEvent("solhack:merchant-changed"));
    } catch (err) {
      toast.err($t("mform.createFail"), { body: err instanceof Error ? err.message : undefined });
    } finally {
      busy = false;
    }
  }
</script>

<div class="grid items-start gap-4 lg:grid-cols-[1fr_300px]">
<form class="glass p-6 sm:p-8" onsubmit={(e) => void submit(e)}>
  <div class="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2">
    <!-- Hero fields first: the subscriber-visible price (amount × period × mint).
         Same bindings/keys as before — only the order and the wrapper changed. -->
    <div class="vf-hero-fields grid gap-4 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-3">
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-white/70"><span class="vf-step">01</span> <span data-i18n="mform.amount">Amount per period</span></span>
      <input id="mf-amount" class="field vf-amount w-full min-w-0 flex-1 px-3.5 py-2.5 font-mono" inputmode="decimal" bind:value={amountUi} placeholder="10" aria-invalid={amountUi.trim() !== "" && rawAmount === null} aria-describedby={amountUi.trim() !== "" && rawAmount === null ? "mf-amount-raw mf-amount-err" : "mf-amount-raw"} />
      <span id="mf-amount-raw" class="vf-monorow">
        raw: {rawAmount?.toString() ?? "—"} {$t("mform.rawUnits")} ({amountUi || "0"} × 10^{effectiveDecimals})
      </span>
      {#if amountUi.trim() !== "" && rawAmount === null}
        <span id="mf-amount-err" class="vf-err" role="alert">{$t("mform.badAmount")} — {$t("mform.badAmountBody")}</span>
      {/if}
    </label>
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-white/70"><span class="vf-step">02</span> <span data-i18n="mform.period">Billing period</span> <span class="text-white/35" data-i18n="mform.periodMin">(min. 30 sec)</span></span>
      <select class="field w-full min-w-0 px-3.5 py-2.5" bind:value={periodPreset}>
        {#each PERIOD_PRESETS as p (p.id)}
          <option value={p.id}>{$t(p.labelKey)}{p.seconds > 0 ? ` · ${p.seconds} ${$t("mform.summarySec")}` : ""}</option>
        {/each}
      </select>
      {#if periodPreset === "custom"}
        <input
          id="mf-custom-sec"
          class="field w-full px-3.5 py-2.5 font-mono"
          inputmode="numeric"
          bind:value={customSeconds}
          data-i18n-ph="mform.customSecondsPh" placeholder="Seconds (min. 30)"
          aria-invalid={customSeconds.trim() !== "" && (!Number.isFinite(Number(customSeconds)) || Number(customSeconds) < 30)}
        />
        {#if customSeconds.trim() !== "" && (!Number.isFinite(Number(customSeconds)) || Number(customSeconds) < 30)}
          <span class="vf-err" role="alert"><span data-i18n="mform.period">Billing period</span> <span data-i18n="mform.periodMin">(min. 30 sec)</span></span>
        {/if}
      {/if}
    </label>
    <label class="flex flex-col gap-1.5 text-sm sm:col-span-2 lg:col-span-1">
      <span class="font-medium text-white/70"><span class="vf-step">03</span> <span data-i18n="mform.mint">Mint</span> <span class="text-white/35" data-i18n="mform.mintDefault">(USDC devnet by default)</span></span>
      <select class="field w-full min-w-0 px-3.5 py-2.5 font-mono text-xs" bind:value={mintChoice}>
        {#each KNOWN_MINTS as m (m.mint)}
          <option value={m.mint}>{m.mint === CUSTOM_MINT ? $t("mform.customMint") : m.label}</option>
        {/each}
      </select>
      {#if mintChoice === CUSTOM_MINT}
        <input
          id="mf-mint"
          class="field w-full px-3.5 py-2.5 font-mono text-xs"
          bind:value={customMint}
          data-i18n-ph="mform.mintAddressPh" placeholder="Mint address…"
          spellcheck={false}
          aria-invalid={customMint.trim() !== "" && !mintValid}
        />
        {#if customMint.trim() !== "" && !mintValid}
          <span class="vf-err" role="alert">{$t("mform.checkMint")}</span>
        {/if}
        <span class="flex gap-2">
          <input
            class="field min-w-0 flex-1 px-3.5 py-2.5 font-mono"
            inputmode="numeric"
            bind:value={customDecimals}
            data-i18n-aria="mform.decimalsAria" aria-label="Decimals"
          />
          <button
            type="button"
            class="btn-ghost shrink-0 cursor-pointer px-3 py-2 text-xs"
            disabled={detecting || !mintValid}
            onclick={() => void detectCustomDecimals()}
          >
            {detecting ? $t("port2.form.detecting") : $t("mform.detect")}
          </button>
        </span>
      {:else}
        <span class="vf-monorow">
          {effectiveMint.slice(0, 12)}… · decimals {effectiveDecimals}{chainDecimals !== null &&
          listDecimals !== null &&
          chainDecimals !== listDecimals
            ? ` (${$t("mform.onChain")} ${chainDecimals})`
            : ""}
        </span>
      {/if}
    </label>
    </div>
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="font-medium text-white/70"><span class="vf-step">04</span> <span data-i18n="mform.planId">Plan ID</span> <span class="text-white/35" data-i18n="mform.planIdHint">(unique per merchant)</span></span>
      <input id="mf-planid" class="field w-full px-3.5 py-2.5 font-mono" inputmode="numeric" bind:value={planId} placeholder="1" aria-invalid={planId.trim() !== "" && !/^\d+$/.test(planId.trim())} />
      {#if planPdaPreview !== null}
        <span class="vf-monorow">plan PDA · {shortAddr(new PublicKey(planPdaPreview), 6)}…</span>
      {/if}
      {#if planId.trim() !== "" && !/^\d+$/.test(planId.trim())}
        <span class="vf-err" role="alert">{$t("mform.fillAll")}</span>
      {/if}
    </label>

    <!-- 05 · optional merchant-declared display metadata (plan card copy).
         Honest by construction: stored and shown exactly as typed, clearly
         labeled as a merchant declaration — never verified on-chain. -->
    <div class="grid gap-4 sm:col-span-2 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70"><span class="vf-step">05</span> <span data-i18n="home2.meta.kicker">Plan metadata</span> <span class="text-white/35" data-i18n="home2.meta.optional">(optional — shown on the card)</span></span>
        <input
          class="field w-full min-w-0 px-3.5 py-2.5"
          bind:value={metaTitle}
          maxlength={META_TITLE_MAX}
          data-i18n-ph="home2.meta.titlePh" placeholder="e.g. Alpha Feed Pro"
          data-i18n-aria="home2.meta.title" aria-label="Title"
        />
      </label>
      <label class="flex flex-col gap-1.5 text-sm">
        <span class="font-medium text-white/70" data-i18n="home2.meta.category">Category</span>
        <select class="field w-full min-w-0 px-3.5 py-2.5" bind:value={metaCategory}>
          <option value="none">{$t("home2.meta.catNone")}</option>
          {#each PLAN_CATEGORIES as cat (cat)}
            <option value={cat}>{$t(planCategoryKey(cat))}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1.5 text-sm sm:col-span-2">
        <span class="font-medium text-white/70" data-i18n="home2.meta.desc">Description</span>
        <textarea
          class="field w-full min-w-0 px-3.5 py-2.5"
          rows="2"
          bind:value={metaDescription}
          maxlength={META_DESCRIPTION_MAX}
          data-i18n-ph="home2.meta.descPh" placeholder="What does this plan include? Shown on the card exactly as you write it."
          data-i18n-aria="home2.meta.desc" aria-label="Description"
        ></textarea>
        <span class="text-[11px] leading-relaxed text-white/40" data-i18n="home2.meta.honesty">
          Declared by you (the merchant) and shown on the plan card as-is — like a product description in Stripe, not verified on-chain.
        </span>
      </label>
    </div>
  </div>

  <p class="mt-4 rounded-xl bg-white/[0.03] p-3 font-mono text-xs break-all text-white/55">
    merchant = <span class="text-[#14f195]">{$wallet.address?.toBase58() ?? $t("mform.connectWallet")}</span>
    · {$t("mform.summaryCollects")} <span class="text-white"> {amountUi || "0"} × 10^{effectiveDecimals} {$t("mform.summaryUnits")} {periodSeconds || 0} {$t("mform.summarySec")}</span>
    <br />
    program = <span class="text-white/80">{CLUSTER} · {shortAddr(PROGRAM_ID, 6)}…</span>
  </p>

  <button type="submit" class="btn-stitch mt-5 w-full cursor-pointer px-4 py-3 text-sm" disabled={!formValid || busy || metaBusy}>
    {busy ? $t("mform.signing") : metaBusy ? $t("home2.meta.saving") : $t("mform.submit")}
  </button>
  {#if !formValid}
    <p class="mt-2 text-center text-xs text-white/40">{$wallet.address === null ? $t("mform.noWalletBody") : $t("mform.fillAll")}</p>
  {/if}
</form>
  <aside class="glass card-hover vf-preview relative overflow-hidden p-5 lg:sticky lg:top-6" aria-label="Subscriber preview" data-i18n-aria="m2.pv.kicker">
    <!-- Decorative glass blobs (Void glassmorphism; template merchant-desktop-rich.html:220-222). -->
    <div class="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-[rgba(153,69,255,0.18)] blur-3xl" aria-hidden="true"></div>
    <div class="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-[rgba(20,241,149,0.12)] blur-2xl" aria-hidden="true"></div>
    <div class="relative flex items-center justify-between gap-2">
      <p class="font-mono text-[11px] tracking-wider text-white/40 uppercase" data-i18n="m2.pv.kicker">Subscriber preview</p>
      <p class="flex items-center gap-1.5 font-mono text-[10px] text-[#14f195]">
        <span class="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#14f195]"></span><span data-i18n="m2.pv.live">Live sync</span>
      </p>
    </div>
    <!-- Plan identity row: real inputs only (planId field + connected merchant).
         With declared metadata the title mirrors what the plan card will show. -->
    <div class="relative mt-3 flex min-w-0 items-baseline justify-between gap-2">
      <p class="min-w-0 truncate text-sm font-semibold text-[#e1e1f0]">
        {#if metaTitle.trim() !== ""}
          {metaTitle.trim()}
        {:else}
          <span data-i18n="m2.pv.planLabel">Subscription</span>
          <span class="font-mono">#{planId.trim() === "" ? "—" : planId.trim()}</span>
        {/if}
      </p>
      {#if $wallet.address !== null}
        <span class="min-w-0 truncate font-mono text-[11px] text-white/45" title={$wallet.address.toBase58()}>{shortAddr($wallet.address, 4)}…</span>
      {/if}
    </div>
    {#if metaDescription.trim() !== ""}
      <p class="relative mt-2 line-clamp-2 text-[11px] leading-relaxed text-white/55">{metaDescription.trim()}</p>
    {/if}
    <p class="vf-hero relative mt-3 text-[#e1e1f0]">
      {rawAmount !== null ? (amountUi || "0") : "—"} <span class="vf-hero-sym">{mintSymbol}</span>
    </p>
    <p class="relative mt-1 text-xs text-white/55"><span data-i18n="m2.pv.per">per</span> {previewPeriod}</p>
    <dl class="relative mt-4 space-y-2.5 text-xs">
      <div class="flex items-center justify-between gap-2">
        <dt
          class="cursor-help text-white/45"
          data-i18n="m2.pv.pda"
          data-i18n-title="m2.pdaTitle"
          title="Program Derived Address — an account address derived from seeds ([plan, merchant, plan_id]); no private key, the program signs via CPI."
        >
          Plan PDA
        </dt>
        <dd class="font-mono text-white/80">
          {#if planPdaPreview !== null}{shortAddr(new PublicKey(planPdaPreview), 6)}…{:else}<span class="text-white/35" data-i18n="m2.pv.noPda">connect wallet for PDA</span>{/if}
        </dd>
      </div>
      <div class="flex items-center justify-between gap-2">
        <dt class="text-white/45" data-i18n="m2.pv.delegate">SPL delegate limit</dt>
        <dd class="font-mono text-[#14f195]">{delegateLimit}</dd>
      </div>
      <div class="flex items-center justify-between gap-2">
        <dt class="text-white/45" data-i18n="m2.pv.delegateNote">= amount × 1 period</dt>
        <dd class="font-mono text-[11px] text-white/40">{effectiveMint.slice(0, 8)}… · 10^{effectiveDecimals}</dd>
      </div>
    </dl>
    <!-- Locked action: rendered disabled like the template's preview button —
         decorative affordance, not a mock of a real action. -->
    <button
      type="button"
      class="btn-ghost mt-4 w-full cursor-not-allowed px-3 py-2 text-xs opacity-60"
      disabled
      aria-hidden="true"
      tabindex="-1"
    >
      <span class="msym align-[-3px] text-[14px]" aria-hidden="true">lock</span>
      <span class="ml-1" data-i18n="m2.pv.view">Preview — read-only</span>
    </button>
    <p class="relative mt-3 border-t border-white/10 pt-3 text-[11px] leading-relaxed text-white/40" data-i18n="m2.pv.note">
      Checkout preview from the subscriber's perspective. Read-only.
    </p>
  </aside>
</div>
<style>
  /* Module 01 Void skin (component scope). Cards use the global .glass / .card-hover. */
  .vf-step {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: rgba(153, 69, 255, 0.14);
    border: 1px solid rgba(153, 69, 255, 0.4);
    color: #d8b9ff;
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    font-weight: 600;
    vertical-align: 1px;
  }
  .vf-amount {
    font-size: 26px;
    line-height: 32px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .vf-monorow {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    line-height: 14px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(206, 194, 216, 0.75);
    word-break: break-all;
  }
  .vf-hero {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 34px;
    line-height: 40px;
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .vf-hero-sym {
    font-size: 15px;
    font-weight: 600;
    color: rgba(225, 225, 240, 0.5);
    letter-spacing: 0;
  }
  /* Funnel pass: hero price fields grouped in a mint-accent frame so the
     judge's eye lands on amount × period × mint first (Module 01 Void skin). */
  .vf-hero-fields {
    border: 1px solid rgba(20, 241, 149, 0.22);
    background: rgba(20, 241, 149, 0.04);
    border-radius: 16px;
    padding: 16px;
  }
  /* Field-adjacent validation errors: coral tokens per DESIGN.md. */
  .vf-err {
    font-size: 12px;
    line-height: 16px;
    color: #ffb4ab;
  }
  /* Subscriber preview: mint-accent frame so the read-only card reads as the
     checkout promise, not as a second form. Sticky on desktop via markup. */
  .vf-preview {
    border: 1px solid rgba(20, 241, 149, 0.28);
    box-shadow:
      0 0 0 1px rgba(20, 241, 149, 0.08),
      0 12px 40px rgba(20, 241, 149, 0.08);
  }
</style>
