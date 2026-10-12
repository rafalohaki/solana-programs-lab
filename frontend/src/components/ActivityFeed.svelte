<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { t } from "../lib/i18n.js";
  import "../lib/i18n-proofs.js";

  // Live on-chain activity: newest-first events recorded by the Helius
  // webhook (POST /api/hooks/helius → Redis `activity`). Polls the public
  // GET /api/activity every 30 s, renders at most 5 with devnet Explorer
  // links. No data / backend down = empty state, never a mock number.
  interface FeedEvent {
    signature: string;
    type: string;
    at: number;
  }

  let events: FeedEvent[] = $state([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  const shortSig = (s: string): string => (s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-4)}` : s);
  const txUrl = (s: string): string => `https://explorer.solana.com/tx/${s}?cluster=devnet`;

  function parseEvents(raw: unknown): FeedEvent[] {
    if (!Array.isArray(raw)) return [];
    const next: FeedEvent[] = [];
    for (const item of raw.slice(0, 5)) {
      if (item === null || typeof item !== "object") continue;
      const { signature, type, at } = item as Record<string, unknown>;
      if (typeof signature !== "string" || typeof type !== "string" || typeof at !== "number") {
        continue;
      }
      next.push({ signature, type, at });
      if (next.length >= 5) break;
    }
    return next;
  }

  async function load(): Promise<void> {
    try {
      const res = await fetch("/api/activity", { headers: { accept: "application/json" } });
      if (!res.ok) return; // keep last state; empty stays empty
      const json: unknown = await res.json();
      if (json === null || typeof json !== "object") return;
      events = parseEvents((json as Record<string, unknown>)["events"]);
    } catch {
      /* offline / backend down = empty state, never a mock */
    }
  }

  onMount(() => {
    void load();
    timer = setInterval(() => void load(), 30_000);
  });
  onDestroy(() => {
    if (timer !== null) clearInterval(timer);
  });
</script>

<div id="activity-feed" class="glass mt-3 rounded-xl px-5 py-4">
  <p class="eyebrow text-white/50">
    <span>{$t("proofs.feedTitle")}</span>
    <span class="ml-2 font-mono text-[11px] normal-case tracking-normal text-white/35"
      >{$t("proofs.feedHint")}</span
    >
  </p>
  {#if events.length === 0}
    <p class="tnum mt-2 text-sm text-white/45">{$t("proofs.feedEmpty")}</p>
  {:else}
    <ol class="mt-2 space-y-1.5">
      {#each events as e (e.signature)}
        <li class="tnum flex items-center justify-between gap-3 text-sm">
          <a
            href={txUrl(e.signature)}
            target="_blank"
            rel="noreferrer"
            title={e.signature}
            class="font-mono text-[13px] text-cyan-300/90 hover:text-cyan-200 hover:underline"
            >{shortSig(e.signature)}</a
          >
          <span class="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-white/55"
            >{e.type}</span
          >
        </li>
      {/each}
    </ol>
  {/if}
</div>
