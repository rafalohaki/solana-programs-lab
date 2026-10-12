<script lang="ts">
  import type { WalletSlot } from "../lib/wallet.js";
  import { availableWallets, connectWallet, disconnectWallet, wallet } from "../lib/wallet.js";
  import { shortAddr } from "../lib/chain.js";
  import { copyText } from "../lib/ui.js";
  import { t, tOr } from "../lib/i18n.js";
  import "../lib/i18n-app.js";
  import "../lib/i18n-home2.js"; // home2.balanceTitle (chip balance tooltip)
  import { onMount } from "svelte";


  let open = $state(false);
  let detected: WalletSlot[] = $state([]);

  let rootEl: HTMLDivElement | null = $state(null);
  let triggerBtn: HTMLButtonElement | null = $state(null);
  let menuEl: HTMLDivElement | null = $state(null);

  onMount(() => {
    detected = availableWallets();
  });

  async function pick(slot: WalletSlot): Promise<void> {
    open = false;
    await connectWallet(slot);
  }

  /** "injected" is a generic unnamed provider — never label it as a brand.
      (PL for wallet.slotInjected lands with the i18n sweep; EN until then.) */
  function walletLabel(slot: WalletSlot): string {
    return slot === "injected" ? tOr("wallet.slotInjected", "Browser wallet") : slot;
  }

  function toggle(): void {
    open = !open;
  }

  /** Address badge copies the full pubkey (toast confirms); the session is
      never destroyed by a click on a small touch target. */
  function copyAddress(): void {
    if ($wallet.address === null) return;
    void copyText($wallet.address.toBase58(), $wallet.name);
  }

  // Close on an outside pointer press; Escape closes and returns focus to
  // the trigger. Listeners live only while the dropdown is open.
  $effect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (rootEl !== null && !rootEl.contains(e.target as Node)) open = false;
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        open = false;
        triggerBtn?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  });

  // Hand focus to the first wallet entry once the dropdown is in the DOM
  // (queried inside the menu panel — the trigger itself is also a button).
  $effect(() => {
    if (!open || menuEl === null) return;
    menuEl.querySelector<HTMLButtonElement>("button")?.focus();
  });

  const label = $derived(
    $wallet.address === null ? $t("wallet.connect") : shortAddr($wallet.address),
  );

  /** Chip balance (Stitch D2): native SOL at 2 dp — "14.82 SOL". The store
   * value is a real /api/rpc read (see wallet.ts); null (loading, RPC error,
   * or getBalance not yet allowlisted upstream) renders no segment at all. */
  const SOL_LAMPORTS = 1_000_000_000;
  const balanceLabel = $derived(
    $wallet.balanceLamports === null
      ? null
      : `${($wallet.balanceLamports / SOL_LAMPORTS).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} SOL`,
  );
</script>

<div class="relative" bind:this={rootEl}>
  {#if $wallet.address === null}
    <button
      bind:this={triggerBtn}
      class="btn-primary inline-flex min-h-[40px] min-w-[7.25rem] cursor-pointer items-center justify-center px-3 py-2.5 text-sm sm:min-w-[9rem] sm:px-4"
      onclick={toggle}
      aria-expanded={open}
      aria-haspopup="true"
      aria-busy={$wallet.connecting}
    >
      {#if $wallet.connecting}
        {$t("wallet.connecting")}
      {:else}
        <!-- Short label below sm keeps the header button to one line on phones. -->
        <span class="sm:hidden" data-i18n="wallet.connectShort">Connect</span>
        <span class="hidden sm:inline">{$t("wallet.connect")}</span>
      {/if}
    </button>
    {#if open}
      <div class="glass-pop absolute right-0 mt-2 w-60 p-2" bind:this={menuEl}>
        {#if detected.length === 0}
          <p class="px-3 py-2 text-xs text-white/60">
            {$t("wallet.noWalletLead")}
            <a class="text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]" href="https://phantom.app" target="_blank" rel="noreferrer">Phantom</a>
            {$t("wallet.noWalletOr")}
            <a class="text-[#7df4ff] underline transition-colors hover:text-[#00f0ff]" href="https://solflare.com" target="_blank" rel="noreferrer">Solflare</a>{$t("wallet.noWalletTail")}
          </p>
        {/if}
        {#each detected as slot (slot)}
          <button
            class="btn-ghost w-full cursor-pointer rounded-lg px-3 py-2.5 text-left text-sm capitalize"
            onclick={() => void pick(slot)}
          >
            {walletLabel(slot)}
          </button>
        {/each}
        {#if $wallet.error}
          <p class="px-3 py-2 text-xs text-[#ff3b69]">{$wallet.error}</p>
        {/if}
      </div>
    {/if}
  {:else}
    <div class="flex min-w-0 items-center gap-2">
      <span class="glass hidden h-10 items-center gap-1.5 rounded-xl px-3 py-2.5 font-mono text-xs whitespace-nowrap text-[#14f195] xl:flex">
        <span class="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#14f195]"></span>
        {$wallet.name === null ? "" : walletLabel($wallet.name)}
      </span>
      <!-- Address badge: click copies the pubkey with a "Copied" toast;
           disconnect moved to the dedicated icon button so a fat-finger tap
           on a small target cannot kill the session. -->
      <button
        class="btn-ghost flex h-10 min-w-0 max-w-[46vw] cursor-pointer items-center gap-2 overflow-hidden px-4 py-2.5 font-mono text-sm whitespace-nowrap sm:max-w-none"
        onclick={copyAddress}
        title={$t("wallet.copyAddr")}
        aria-label={$t("wallet.copyAddr")}
      >
        <!-- Avatar dot (reference chip) — decoration only, session state is real. -->
        <span class="live-dot inline-block h-2 w-2 shrink-0 rounded-full bg-[#14f195]" aria-hidden="true"></span>
        <span class="min-w-[4.5rem] truncate">{label}</span>
        {#if balanceLabel !== null}
          <!-- Balance hidden on phones (reference parity): the header must stay
               one line and min-w-0 keeps the address from forcing overflow. -->
          <span
            class="tnum hidden shrink-0 border-l border-white/10 pl-2 text-[11px] whitespace-nowrap text-[#a5e8c8] sm:inline"
            title={$t("home2.balanceTitle")}
          >
            {balanceLabel}
          </span>
        {/if}
      </button>
      <button
        class="btn-ghost inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center px-2.5 py-2.5"
        onclick={() => void disconnectWallet()}
        title={$t("wallet.disconnect")}
        aria-label={$t("wallet.disconnect")}
      >
        <span class="msym text-[18px]" aria-hidden="true">link_off</span>
      </button>
    </div>
  {/if}
</div>
