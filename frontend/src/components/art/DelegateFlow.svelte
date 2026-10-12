<script lang="ts">
  // Animated delegate-flow diagram (pure SVG + CSS, zero dependencies).
  // Tells the Model B story at a glance: wallet → capped approve →
  // Subscription PDA → charge → merchant, with fee packets riding the rails.
  // Self-i18n via df.* (i18n-home2); props override for special contexts.
  import { t } from "../../lib/i18n.js";
  import "../../lib/i18n-home2.js";

  interface Props {
    walletLabel?: string;
    approveLabel?: string;
    pdaLabel?: string;
    chargeLabel?: string;
    merchantLabel?: string;
    custodyLabel?: string;
    class?: string;
  }

  let {
    walletLabel = undefined,
    approveLabel = undefined,
    pdaLabel = undefined,
    chargeLabel = undefined,
    merchantLabel = undefined,
    custodyLabel = undefined,
    class: className = "",
  }: Props = $props();

  const wallet = $derived(walletLabel ?? $t("df.wallet"));
  const approve = $derived(approveLabel ?? $t("df.approve"));
  const pda = $derived(pdaLabel ?? $t("df.pda"));
  const charge = $derived(chargeLabel ?? $t("df.charge"));
  const merchant = $derived(merchantLabel ?? $t("df.merchant"));
  const custody = $derived(custodyLabel ?? $t("df.custody"));
</script>

<div class={`delegate-flow ${className}`} aria-hidden="true">
  <svg viewBox="0 0 720 220" fill="none" xmlns="http://www.w3.org/2000/svg" role="img">
    <defs>
      <linearGradient id="df-brand" x1="0" y1="0" x2="720" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stop-color="#9945FF" />
        <stop offset="0.5" stop-color="#00dbe9" />
        <stop offset="1" stop-color="#14F195" />
      </linearGradient>
      <linearGradient id="df-tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="rgba(153,69,255,0.25)" />
        <stop offset="1" stop-color="rgba(20,241,149,0.18)" />
      </linearGradient>
      <radialGradient id="df-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="rgba(153,69,255,0.35)" />
        <stop offset="1" stop-color="rgba(153,69,255,0)" />
      </radialGradient>
    </defs>

    <!-- soft ambient (radial gradient fades to zero — no hard clip edges) -->
    <circle cx="360" cy="110" r="150" fill="url(#df-glow)" opacity="0.5" />

    <!-- rails -->
    <path d="M118 110 H 288" stroke="url(#df-brand)" stroke-width="2" stroke-dasharray="7 9" class="df-dash" />
    <path d="M432 110 H 602" stroke="url(#df-brand)" stroke-width="2" stroke-dasharray="7 9" class="df-dash df-dash-2" />
    <path d="M288 110 l -9 -5 v 10 z" fill="#00dbe9" />
    <path d="M602 110 l -9 -5 v 10 z" fill="#14F195" />

    <!-- fee packets riding the rails (CSS offset-path; off for reduced motion) -->
    <circle r="5" fill="#d8b9ff" class="df-packet df-packet-1" />
    <circle r="5" fill="#14F195" class="df-packet df-packet-2" />

    <!-- wallet node -->
    <g>
      <rect x="38" y="76" width="80" height="68" rx="14" fill="url(#df-tile)" stroke="rgba(255,255,255,0.14)" />
      <rect x="54" y="96" width="48" height="28" rx="7" fill="#11131d" stroke="rgba(255,255,255,0.2)" />
      <circle cx="94" cy="110" r="3.5" fill="#14F195" class="df-blink" />
      <text x="78" y="168" text-anchor="middle" class="df-label">{wallet}</text>
    </g>

    <!-- PDA node (brand diamond ring) -->
    <g>
      <circle cx="360" cy="110" r="46" fill="#12141e" stroke="url(#df-brand)" stroke-width="2" />
      <circle cx="360" cy="110" r="46" stroke="rgba(153,69,255,0.4)" stroke-width="8" class="df-halo" fill="none" />
      <rect x="338" y="88" width="44" height="44" rx="10" transform="rotate(45 360 110)" fill="none" stroke="url(#df-brand)" stroke-width="2.5" />
      <circle cx="360" cy="110" r="6" fill="#ffffff" />
      <text x="360" y="182" text-anchor="middle" class="df-label">{pda}</text>
      <text x="360" y="56" text-anchor="middle" class="df-cap">{approve}</text>
    </g>

    <!-- merchant node -->
    <g>
      <rect x="602" y="76" width="80" height="68" rx="14" fill="url(#df-tile)" stroke="rgba(255,255,255,0.14)" />
      <path d="M622 110 h 40 M642 90 v 40" stroke="#14F195" stroke-width="3" stroke-linecap="round" />
      <rect x="630" y="98" width="24" height="24" rx="5" fill="none" stroke="#14F195" stroke-width="2.5" />
      <text x="642" y="168" text-anchor="middle" class="df-label">{merchant}</text>
      <text x="642" y="56" text-anchor="middle" class="df-cap">{charge}</text>
    </g>

    <!-- zero-custody strip -->
    <g>
      <rect x="150" y="192" width="420" height="22" rx="11" fill="rgba(20,241,149,0.1)" stroke="rgba(20,241,149,0.3)" />
      <circle cx="166" cy="203" r="3" fill="#14F195" class="df-blink" />
      <text x="360" y="207" text-anchor="middle" class="df-custody">{custody}</text>
    </g>
  </svg>
</div>

<style>
  .delegate-flow {
    width: 100%;
    max-width: 720px;
    margin-inline: auto;
  }
  svg {
    width: 100%;
    height: auto;
    display: block;
    /* cap labels sit at the viewBox edge — let them breathe into card padding */
    overflow: visible;
  }
  .df-label {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 12px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    fill: rgba(225, 225, 240, 0.75);
  }
  .df-cap {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: #00dbe9;
  }
  .df-custody {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    fill: #14f195;
  }

  .df-dash {
    animation: df-march 1.2s linear infinite;
  }
  .df-dash-2 {
    animation-duration: 0.9s;
  }
  @keyframes df-march {
    to {
      stroke-dashoffset: -32;
    }
  }

  .df-packet {
    offset-path: path("M118 110 H 288");
    offset-distance: 0%;
    animation: df-ride-1 2.6s linear infinite;
    filter: drop-shadow(0 0 6px rgba(216, 185, 255, 0.8));
  }
  .df-packet-2 {
    offset-path: path("M432 110 H 602");
    animation-name: df-ride-2;
    animation-duration: 2s;
    animation-delay: 0.9s;
    filter: drop-shadow(0 0 6px rgba(20, 241, 149, 0.8));
  }
  @keyframes df-ride-1 {
    0% {
      offset-distance: 0%;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    88% {
      opacity: 1;
    }
    100% {
      offset-distance: 100%;
      opacity: 0;
    }
  }
  @keyframes df-ride-2 {
    0% {
      offset-distance: 0%;
      opacity: 0;
    }
    12% {
      opacity: 1;
    }
    88% {
      opacity: 1;
    }
    100% {
      offset-distance: 100%;
      opacity: 0;
    }
  }

  .df-halo {
    animation: df-halo 3s ease-in-out infinite;
    transform-origin: 360px 110px;
  }
  @keyframes df-halo {
    0%,
    100% {
      opacity: 0.25;
      transform: scale(1);
    }
    50% {
      opacity: 0.6;
      transform: scale(1.06);
    }
  }
  .df-blink {
    animation: df-blink 1.6s ease-in-out infinite;
  }
  @keyframes df-blink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .df-dash,
    .df-packet,
    .df-halo,
    .df-blink {
      animation: none;
    }
    .df-packet {
      opacity: 0;
    }
  }
</style>
