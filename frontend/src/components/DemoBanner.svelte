<script lang="ts">
  import { onMount } from "svelte";
  import { isDemoMode, setDemoMode } from "../lib/demo.js";
  import "../lib/i18n-admin.js";

  // SSR-known shareable flag (?demo=1): banner paints in first HTML instead of
  // waiting for idle hydration. The persisted localStorage flag still resolves
  // on mount (client-only by nature).
  interface Props {
    demo?: boolean;
  }
  let { demo: initial = false }: Props = $props();

  let demo = $state(initial);

  onMount(() => {
    demo = isDemoMode();
  });
</script>

{#if demo}
  <div
    role="status"
    class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-2 text-center"
    style="border-bottom: 1px solid rgba(255, 59, 105, 0.35); background: rgba(255, 59, 105, 0.08);"
  >
    <span class="chip-pastdue">DEMO</span>
    <p class="font-mono text-xs text-[#e1e1f0]">
      <span data-i18n="demo.banner">DEMO — fixture data, not on-chain.</span>
    </p>
    <button
      type="button"
      class="cursor-pointer rounded-lg px-3 py-1 font-mono text-[11px] font-medium tracking-wider uppercase transition-colors hover:bg-[rgba(20,241,195,0.1)]"
      style="border: 1px solid rgba(20, 241, 149, 0.4); color: #14f195;"
      onclick={() => setDemoMode(false)}
    >
      <span data-i18n="demo.exit">Exit demo</span>
    </button>
  </div>
{/if}
