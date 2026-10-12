<script lang="ts">
  import { lang, setLang } from "../lib/i18n.js";
  import "../lib/i18n-static.js";
  import type { Lang } from "../lib/i18n.js";

  const options: Lang[] = ["en", "pl"];

  function pick(next: Lang): void {
    setLang(next);
  }
</script>

<!-- Segment toggle on the shared .pillbar tray + aria-pressed — same pattern
     as the AdminPanel mode switch. -->
<div
  class="pillbar flex items-center gap-0.5 p-0.5 text-xs font-semibold"
  role="group"
  aria-label="Language / Język"
>
  {#each options as code (code)}
    <button
      type="button"
      class="cursor-pointer rounded-full px-2 py-1 tracking-wide uppercase transition-colors duration-100 {code === $lang
        ? 'bg-white/10 text-white'
        : 'text-white/60 hover:text-white/80'}"
      aria-pressed={code === $lang}
      onclick={() => pick(code)}
    >
      {code}
    </button>
  {/each}
</div>
