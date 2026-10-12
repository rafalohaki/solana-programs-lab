<script lang="ts">
  import type { Plan } from "../lib/chain.js";
  import { connection, explorerTxUrl, fetchMintDecimals, fetchPlans } from "../lib/chain.js";
  import { toast } from "../lib/ui.js";
  import { subscribeActionUrl } from "../lib/blinks.js";
  import { signAndSendAction, wallet } from "../lib/wallet.js";
  import { t } from "../lib/i18n.js";
  import { DEVNET_USDC_MINT, KNOWN_MINTS } from "../lib/mints.js";
  import {
    fetchPlansMeta,
    planCategoryKey,
    PLAN_CATEGORIES,
    type PlanCategory,
    type PlanMeta,
  } from "../lib/plansMeta.js";
  import "../lib/i18n-port1.js";
  import "../lib/i18n-home2.js";
  import { onMount } from "svelte";
  import PlanCard from "./PlanCard.svelte";
  import SubscriptionModal from "./SubscriptionModal.svelte";
  import EmptyState from "./art/EmptyState.svelte";

  const WSOL_MINT = "So11111111111111111111111111111111111111112";

  type MintFilter = "all" | "usdc" | "sol" | "custom";
  type CategoryFilter = "all" | PlanCategory;

  let plans: Plan[] = $state([]);
  let decimals: Record<string, number> = $state({});
  // Merchant-DECLARED metadata keyed by plan PDA (Stitch D1). An absent entry
  // means "no declaration": the card falls back to the on-chain-only view.
  let metas: Record<string, PlanMeta> = $state({});
  let loading = $state(true);
  let loadError: string | null = $state(null);
  let busyPlan: string | null = $state(null);
  let filter: MintFilter = $state("all");
  let catFilter: CategoryFilter = $state("all");
  // Monotonic sequence for reload(): a slower stale response (double-click on
  // refresh, remount race) must never overwrite state written by a newer run.
  let reloadSeq = 0;

  /** Map a raw mint address onto the only symbols we can claim truthfully. */
  function mintBucket(mintBase58: string): Exclude<MintFilter, "all"> {
    if (mintBase58 === WSOL_MINT) return "sol";
    if (mintBase58 === DEVNET_USDC_MINT) return "usdc";
    const hit = KNOWN_MINTS.find((m) => m.mint === mintBase58 && m.symbol !== "CUSTOM");
    if (hit?.symbol === "USDC") return "usdc";
    if (hit?.symbol === "SOL") return "sol";
    return "custom";
  }

  /** Display symbol for the subscribe modal (same truth rules as mintBucket). */
  function mintSymbol(mintBase58: string): string | null {
    if (mintBase58 === WSOL_MINT) return "SOL";
    if (mintBase58 === DEVNET_USDC_MINT) return "USDC";
    return KNOWN_MINTS.find((m) => m.mint === mintBase58 && m.symbol !== "CUSTOM")?.symbol ?? null;
  }

  /** Category of a plan's declaration, when the merchant made one. */
  function planCategory(p: Plan): PlanCategory | null {
    return metas[p.address.toBase58()]?.category ?? null;
  }

  /** Categories that REALLY exist in the loaded plans' metadata — the filter
   *  row offers nothing else (no aspirational/invented categories). */
  const availableCategories = $derived(
    PLAN_CATEGORIES.filter((cat) => plans.some((p) => planCategory(p) === cat)),
  );

  // A refresh can make the selected category disappear (metadata edited
  // elsewhere) — fall back to "all" instead of a permanently empty grid.
  $effect(() => {
    if (catFilter !== "all" && !availableCategories.includes(catFilter)) catFilter = "all";
  });

  const filtered = $derived(
    plans.filter(
      (p) =>
        (filter === "all" || mintBucket(p.mint.toBase58()) === filter) &&
        (catFilter === "all" || planCategory(p) === catFilter),
    ),
  );

  const filterKeys: MintFilter[] = ["all", "usdc", "sol", "custom"];

  function filterLabel(f: MintFilter): string {
    if (f === "all") return $t("filters.all");
    if (f === "usdc") return $t("filters.usdc");
    if (f === "sol") return $t("filters.sol");
    return $t("filters.custom");
  }

  onMount(() => {
    void reload();
  });

  async function reload(): Promise<void> {
    const seq = ++reloadSeq;
    loading = true;
    loadError = null;
    try {
      const conn = connection();
      const found = await fetchPlans(conn);
      if (seq !== reloadSeq) return;
      plans = found;
      const resolved: Record<string, number> = {};
      await Promise.all(
        found.map(async (p) => {
          const key = p.mint.toBase58();
          if (resolved[key] === undefined) resolved[key] = await fetchMintDecimals(conn, p.mint);
        }),
      );
      if (seq !== reloadSeq) return;
      decimals = resolved;
      // Stitch D1: merchant-declared metadata for the visible plans. Fail-soft
      // by design — metadata is optional display copy, so a registry outage
      // degrades to the previous on-chain-only cards, never to fake data.
      try {
        const fetched = await fetchPlansMeta(found.map((p) => p.address.toBase58()));
        if (seq !== reloadSeq) return;
        metas = fetched;
      } catch {
        if (seq !== reloadSeq) return;
        metas = {};
      }
    } catch (err) {
      if (seq !== reloadSeq) return;
      loadError = err instanceof Error ? err.message : $t("plans.loadError");
    } finally {
      // Only the newest run owns the shared loading flag.
      if (seq === reloadSeq) loading = false;
    }
  }

  /**
   * Existing Actions round-trip (build → assert → sign → send → confirm),
   * untouched — only the return type changed: the subscribe modal closes on
   * success (true) and stays open on failure (false) so the error toast and a
   * retry are one click apart. Toasts stay the single outcome surface.
   */
  async function subscribe(plan: Plan): Promise<boolean> {
    const address = $wallet.address;
    if (address === null) {
      toast.err($t("plans.noWalletTitle"), { body: $t("plans.noWalletBody") });
      return false;
    }
    const key = plan.address.toBase58();
    busyPlan = key;
    try {
      const endpoint = subscribeActionUrl(key, plan.mint.toBase58(), plan.amount.toString());
      const { signature } = await signAndSendAction(endpoint);
      toast.ok($t("plans.subOk"), {
        body: signature,
        link: { label: $t("plans.viewInExplorer"), href: explorerTxUrl(signature) },
      });
      return true;
    } catch (err) {
      toast.err($t("plans.subFail"), { body: err instanceof Error ? err.message : undefined });
      return false;
    } finally {
      busyPlan = null;
    }
  }

  // --- Stitch D3: confirmation modal before the wallet popup ------------------

  /** Plan staged in the confirmation modal (null = closed). */
  let modalPlan: Plan | null = $state(null);

  /** Script-level functions keep prop identity stable for the modal's $effect. */
  function closeModal(): void {
    modalPlan = null;
  }

  async function confirmModal(plan: Plan): Promise<void> {
    if (await subscribe(plan)) modalPlan = null;
  }

  const modalDecimals = $derived(
    modalPlan === null ? 6 : (decimals[modalPlan.mint.toBase58()] ?? 6),
  );
  const modalSymbol = $derived(modalPlan === null ? null : mintSymbol(modalPlan.mint.toBase58()));
  const modalBusy = $derived(
    modalPlan !== null && busyPlan === modalPlan.address.toBase58(),
  );
</script>

<div class="mb-6 flex flex-wrap items-center gap-2">
  <!-- Group name follows the app language like all other copy (AdminPanel pattern). -->
  <div class="inline-flex flex-wrap gap-1.5 rounded-lg bg-[#0c0e17] p-1" role="group" aria-label={$t("filters.groupAria")}>
    {#each filterKeys as f (f)}
      <button
        class="filter-pill"
        aria-pressed={filter === f}
        onclick={() => {
          filter = f;
        }}
      >
        {filterLabel(f)}
      </button>
    {/each}
  </div>
  {#if availableCategories.length > 0}
    <!-- Stitch D1: category filters — built ONLY from categories that really
         exist in the loaded plans' merchant-declared metadata. -->
    <div class="inline-flex flex-wrap gap-1.5 rounded-lg bg-[#0c0e17] p-1" role="group" aria-label={$t("home2.catGroupAria")}>
      <button class="filter-pill" aria-pressed={catFilter === "all"} onclick={() => (catFilter = "all")}>
        {$t("home2.catAll")}
      </button>
      {#each availableCategories as cat (cat)}
        <button class="filter-pill" aria-pressed={catFilter === cat} onclick={() => (catFilter = cat)}>
          {$t(planCategoryKey(cat))}
        </button>
      {/each}
    </div>
  {/if}
  <button
    class="btn-ghost cursor-pointer p-2.5"
    onclick={() => void reload()}
    title={$t("filters.refresh")}
    aria-label={$t("filters.refresh")}
  >
    <span class="msym block text-[18px]" aria-hidden="true">refresh</span>
  </button>
  {#if !loading && loadError === null && plans.length > 0}
    <span class="tag-pill tnum ml-auto">
      <span class="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#14f195]" aria-hidden="true"></span>
      {$t("filters.count")} {filtered.length}/{plans.length} · <span data-i18n="home1.live">LIVE</span>
    </span>
  {/if}
</div>

{#if loading}
  <div class="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
    {#each [0, 1, 2] as i (i)}
      <div class="skeleton h-[600px] rounded-xl"></div>
    {/each}
  </div>
{:else if loadError !== null}
  <div class="glass rounded-xl p-5 text-center">
    <p class="font-display text-base font-bold text-[#ffb4ab]" data-i18n="plans.loadFailTitle">Could not load plans</p>
    <p class="mx-auto mt-1 max-w-xl font-mono text-xs break-all text-white/50">{loadError}</p>
    <button class="btn-ghost mt-4 cursor-pointer px-4 py-2 text-sm" onclick={() => void reload()} data-i18n="plans.retry">
      Try again
    </button>
  </div>
{:else if plans.length === 0}
  <!-- Live chain has no plans yet: art + the always-visible merchant strip
       below the grid carries the CTA, so nothing is duplicated here. -->
  <div class="glass rounded-xl p-5">
    <EmptyState variant="plans" />
  </div>
{:else if filtered.length === 0}
  <div class="glass flex flex-col items-start gap-4 rounded-xl p-5 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex items-center gap-4">
      <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/40">
        <span class="msym text-[24px]" aria-hidden="true">search_off</span>
      </div>
      <div>
        <p class="font-display text-base font-bold">{$t("empty.filtered")}</p>
        <p class="mt-1 font-mono text-xs text-white/55">{$t("empty.stripLead")}</p>
      </div>
    </div>
    <div class="flex max-w-full shrink-0 flex-wrap gap-2">
      <button
        class="btn-ghost cursor-pointer px-4 py-2.5 text-sm"
        onclick={() => {
          filter = "all";
          catFilter = "all";
        }}
      >
        {$t("filters.all")}
      </button>
      <a href="/merchant" class="btn-stitch px-5 py-2.5 text-sm">
        {$t("empty.cta")}
        <span class="msym text-[16px]" aria-hidden="true">arrow_forward</span>
      </a>
    </div>
  </div>
{:else}
  <div class="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
    {#each filtered as plan (plan.address.toBase58())}
      <PlanCard
        {plan}
        decimals={decimals[plan.mint.toBase58()] ?? 6}
        busy={busyPlan === plan.address.toBase58()}
        connected={$wallet.address !== null}
        meta={metas[plan.address.toBase58()] ?? null}
        onSubscribe={(p) => {
          // Stitch D3: stage the plan in the confirmation modal; the wallet
          // popup only happens after "Confirm and sign".
          modalPlan = p;
        }}
      />
    {/each}
  </div>
{/if}

<SubscriptionModal
  plan={modalPlan}
  decimals={modalDecimals}
  symbol={modalSymbol}
  busy={modalBusy}
  onConfirm={confirmModal}
  onClose={closeModal}
/>
