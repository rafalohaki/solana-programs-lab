<script lang="ts">
  import { onMount } from "svelte";
  import { isAdmin, isDemoMode, setDemoMode } from "../lib/admin.js";
  import { demoShareLink } from "../lib/demo.js";
  import { wallet } from "../lib/wallet.js";
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-admin.js";

  let demo = $state(false);
  let copied = $state(false);

  onMount(() => {
    demo = isDemoMode();
  });

  const statusKey = $derived(demo ? "admin.statusDemo" : "admin.statusLive");

  function copyLink(): void {
    const link = demoShareLink();
    const done = (): void => {
      copied = true;
      window.setTimeout(() => {
        copied = false;
      }, 2000);
    };
    if (typeof navigator !== "undefined" && navigator.clipboard !== undefined) {
      void navigator.clipboard.writeText(link).then(done, () => fallbackCopy(link, done));
    } else {
      fallbackCopy(link, done);
    }
  }

  function fallbackCopy(link: string, done: () => void): void {
    const ta = document.createElement("textarea");
    ta.value = link;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
    } catch {
      /* clipboard unavailable — caller still flips the confirmation */
    }
    ta.remove();
    done();
  }
</script>

{#if isAdmin($wallet.address)}
  <div class="mx-auto max-w-6xl px-4 sm:px-6">
    <section class="glass rounded-2xl p-5" aria-label={$t("admin.panel")}>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="eyebrow text-white/40">{$t("admin.panel")}</p>
        {#if demo}
          <span class="chip-pastdue">{$t("admin.demo")}</span>
        {:else}
          <span class="chip-active">{$t("admin.live")}</span>
        {/if}
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <span class="font-mono text-[11px] tracking-wider text-white/40 uppercase">{$t("admin.mode")}:</span>
        <div role="group" aria-label={$t("admin.modeAria")} class="pillbar flex items-center gap-1 p-1">
          <button
            type="button"
            class="cursor-pointer rounded-full px-3 py-1.5 text-sm transition-colors duration-100 {demo
              ? 'bg-white/10 text-white'
              : 'text-white/45 hover:text-white/80'}"
            aria-pressed={demo}
            aria-current={demo ? "true" : undefined}
            onclick={() => setDemoMode(true)}
          >
            {$t("admin.demo")}
          </button>
          <button
            type="button"
            class="cursor-pointer rounded-full px-3 py-1.5 text-sm transition-colors duration-100 {!demo
              ? 'bg-white/10 text-white'
              : 'text-white/45 hover:text-white/80'}"
            aria-pressed={!demo}
            aria-current={!demo ? "true" : undefined}
            onclick={() => setDemoMode(false)}
          >
            {$t("admin.live")}
          </button>
        </div>
        <button type="button" class="btn-secondary cursor-pointer px-3 py-1.5 text-sm" onclick={copyLink}>
          {copied ? $t("admin.copied") : $t("admin.copyLink")}
        </button>
      </div>

      <p class="tnum mt-3 font-mono text-xs text-white/55">{$t(statusKey)}</p>

      <p class="eyebrow mt-4 text-white/40">{$t("admin.replaces")}</p>
      <ul class="mt-2 space-y-1.5 font-mono text-xs text-white/55">
        <li class="hairline pt-1.5">{$t("admin.replacesStats")}</li>
        <li class="hairline pt-1.5">{$t("admin.replacesPlans")}</li>
        <li class="hairline pt-1.5">{$t("admin.replacesReceipts")}</li>
      </ul>
    </section>
  </div>
{/if}
