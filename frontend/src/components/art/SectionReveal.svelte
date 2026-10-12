<script lang="ts">
  // Stitch D4 port: optional section entry wrapper — fade + slide-in on first
  // viewport entry, driven by one IntersectionObserver per instance (no
  // dependency, no framer). NOT mounted anywhere by this change: wrap a section
  // in Astro/Svelte when a slice opts in, e.g.
  //   <SectionReveal>…section content…</SectionReveal>
  // Honest-motion rules: the hidden state is applied from JS ONLY (SSR and
  // no-JS renders stay fully visible — content can never be lost), and
  // prefers-reduced-motion skips the animation entirely.
  import type { Snippet } from "svelte";

  interface Props {
    /** Extra classes on the wrapper (layout/spacing stay the caller's job). */
    class?: string;
    /** Stagger delay in ms before the reveal transition starts. */
    delay?: number;
    children?: Snippet;
  }

  let { class: className = "", delay = 0, children }: Props = $props();

  let el: HTMLDivElement | null = $state(null);

  $effect(() => {
    const node = el;
    if (node === null) return;
    // Reduced motion or a missing observer → leave the section visible, done.
    if (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    if (delay > 0) node.style.setProperty("--reveal-delay", `${delay}ms`);
    // Pending state goes on from JS (never SSR markup) so a failed/absent
    // script cannot hide content; the observer then swaps it for reveal-in.
    node.classList.add("reveal-pending");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("reveal-in");
          io.unobserve(entry.target);
        }
      },
      // Fire once the section is meaningfully on screen, not 1px deep.
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  });
</script>

<div class={`section-reveal min-w-0 ${className}`} bind:this={el}>
  {@render children?.()}
</div>

<style>
  /* Hidden state (JS-added only) → visible state; the transition lives on
     reveal-in so it starts exactly when the class flips. */
  .section-reveal.reveal-pending {
    opacity: 0;
    transform: translateY(14px);
  }
  .section-reveal.reveal-in {
    opacity: 1;
    transform: none;
    transition:
      opacity 0.5s ease-out var(--reveal-delay, 0ms),
      transform 0.5s ease-out var(--reveal-delay, 0ms);
  }
  @media (prefers-reduced-motion: reduce) {
    .section-reveal.reveal-pending,
    .section-reveal.reveal-in {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
</style>
