<script lang="ts">
  import { dismissToast, toasts } from "../lib/ui.js";
  import "../lib/i18n-app.js";
</script>

<div class="pointer-events-none fixed right-5 bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-5 z-50 flex w-[min(92vw,380px)] flex-col gap-2" aria-live="polite">
  {#each $toasts as t (t.id)}
    <div
      class="toast-in glass pointer-events-auto rounded-xl border-l-2 px-4 py-3 {t.kind === 'ok'
        ? 'border-l-[#14f195]'
        : t.kind === 'err'
          ? 'border-l-[#ff3b69]'
          : 'border-l-[#00f0ff]'}"
    >
      <div class="flex items-start justify-between gap-3">
        <p class="text-sm font-semibold text-white">{t.title}</p>
        <button
          class="cursor-pointer text-xs text-white/60 transition-colors hover:text-white/80"
          onclick={() => dismissToast(t.id)}
          aria-label="Dismiss notification"
          data-i18n-aria="toasts.dismiss"
        >
          ✕
        </button>
      </div>
      {#if t.body}
        <p class="mt-1 font-mono text-xs break-all text-white/60">{t.body}</p>
      {/if}
      {#if t.link}
        <a
          class="mt-1.5 inline-block text-xs font-semibold text-[#7df4ff] transition-colors hover:text-[#00f0ff]"
          href={t.link.href}
          target="_blank"
          rel="noreferrer"
        >
          {t.link.label} ↗
        </a>
      {/if}
    </div>
  {/each}
</div>
