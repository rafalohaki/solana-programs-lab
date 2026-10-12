<script lang="ts">
  // Line-art empty-state illustration (pure SVG + CSS, zero dependencies).
  // variant "plans"   = vault ring with a slow-orbiting satellite
  // variant "receipts"= dashed receipt with a scanning line
  // variant "generic" = soft diamond ring (brand mark)
  // Self-i18n via ea.* (i18n-home2), same pattern as DelegateFlow's df.*.
  import { t } from "../../lib/i18n.js";
  import "../../lib/i18n-home2.js";

  interface Props {
    variant?: "plans" | "receipts" | "generic";
    class?: string;
  }

  let { variant = "generic", class: className = "" }: Props = $props();
</script>

<div class={`empty-art ${className}`} aria-hidden="true">
  <svg viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ea-brand" x1="20" y1="10" x2="140" y2="110" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#9945FF" />
        <stop offset="1" stop-color="#14F195" />
      </linearGradient>
    </defs>

    {#if variant === "plans"}
      <!-- vault: brand diamond ring + orbiting satellite -->
      <circle cx="80" cy="58" r="40" stroke="rgba(255,255,255,0.08)" stroke-width="1.5" class="ea-orbit-ring" />
      <rect x="62" y="40" width="36" height="36" rx="8" transform="rotate(45 80 58)" stroke="url(#ea-brand)" stroke-width="2" fill="rgba(18,20,30,0.6)" />
      <rect x="72" y="50" width="16" height="16" rx="4" transform="rotate(45 80 58)" fill="none" stroke="rgba(216,185,255,0.7)" stroke-width="1.5" />
      <g class="ea-orbit">
        <circle cx="80" cy="18" r="3.5" fill="#14F195" />
      </g>
      <text x="80" y="114" text-anchor="middle" class="ea-note">{$t("ea.notePlans")}</text>
    {:else if variant === "receipts"}
      <!-- receipt sheet with a scanning line -->
      <path d="M50 22 h60 v70 l-8 -6 -8 6 -8 -6 -8 6 -8 -6 -8 6 -8 -6 -8 6 z" fill="rgba(18,20,30,0.6)" stroke="rgba(255,255,255,0.16)" stroke-width="1.5" />
      <line x1="62" y1="40" x2="98" y2="40" stroke="rgba(225,225,240,0.35)" stroke-width="2" stroke-linecap="round" />
      <line x1="62" y1="52" x2="92" y2="52" stroke="rgba(225,225,240,0.22)" stroke-width="2" stroke-linecap="round" />
      <line x1="62" y1="64" x2="96" y2="64" stroke="rgba(225,225,240,0.22)" stroke-width="2" stroke-linecap="round" />
      <rect x="46" y="30" width="68" height="10" rx="5" fill="url(#ea-brand)" opacity="0.25" class="ea-scan" />
      <text x="80" y="114" text-anchor="middle" class="ea-note">{$t("ea.noteReceipts")}</text>
    {:else}
      <!-- brand diamond ring -->
      <rect x="60" y="38" width="40" height="40" rx="9" transform="rotate(45 80 58)" stroke="url(#ea-brand)" stroke-width="2" fill="rgba(18,20,30,0.6)" />
      <circle cx="80" cy="58" r="4" fill="#ffffff" />
      <text x="80" y="114" text-anchor="middle" class="ea-note">{$t("ea.noteGeneric")}</text>
    {/if}
  </svg>
</div>

<style>
  .empty-art {
    width: 100%;
    max-width: 160px;
    margin-inline: auto;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
  }
  .ea-note {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: rgba(225, 225, 240, 0.35);
  }
  .ea-orbit-ring {
    stroke-dasharray: 3 6;
  }
  .ea-orbit {
    offset-path: circle(40px at 80px 58px);
    offset-distance: 0%;
    animation: ea-orbit 9s linear infinite;
    transform-box: view-box;
  }
  @keyframes ea-orbit {
    to {
      offset-distance: 100%;
    }
  }
  .ea-scan {
    animation: ea-scan 2.8s ease-in-out infinite;
  }
  @keyframes ea-scan {
    0%,
    100% {
      transform: translateY(0);
      opacity: 0.15;
    }
    50% {
      transform: translateY(44px);
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ea-orbit,
    .ea-scan {
      animation: none;
    }
  }
</style>
