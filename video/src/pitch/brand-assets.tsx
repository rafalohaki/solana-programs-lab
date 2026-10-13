// Static brand assets for the Colosseum submission.
//
// Rendered with `remotion still` so the logo/OG graphic share the exact
// typography, gradient and wordmark used in the pitch and demo videos. The live
// site's own og-image still reads "Subscriptions.sol", which clashes with the
// submission brand, so these are generated here instead of reused.
import React from "react";
import { AbsoluteFill } from "remotion";
import { C, GRAD, GradText, LogoMark, Wordmark } from "./brand";

const VOID = "#0c0e17";

/** Soft brand bloom behind the mark; kept subtle so it survives text overlay. */
const Bloom: React.FC = () => (
  <AbsoluteFill>
    <div
      style={{
        position: "absolute",
        width: 1400,
        height: 1400,
        left: "50%",
        top: "50%",
        transform: "translate(-50%,-50%)",
        background: `radial-gradient(circle, rgba(153,69,255,0.26), transparent 62%)`,
        filter: "blur(50px)",
      }}
    />
    <div
      style={{
        position: "absolute",
        width: 1100,
        height: 1100,
        left: "62%",
        top: "58%",
        transform: "translate(-50%,-50%)",
        background: `radial-gradient(circle, rgba(20,241,195,0.20), transparent 64%)`,
        filter: "blur(50px)",
      }}
    />
  </AbsoluteFill>
);

const Grid: React.FC = () => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
      backgroundSize: "56px 56px",
    }}
  />
);

/**
 * Square app icon: mark only, no wordmark, so it stays legible at favicon size
 * and on a square submission tile.
 */
export const LogoSquare: React.FC = () => (
  <AbsoluteFill style={{ background: VOID, justifyContent: "center", alignItems: "center" }}>
    <Bloom />
    <Grid />
    <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <LogoMark size={520} />
    </div>
  </AbsoluteFill>
);

/** Wide lockup: mark + wordmark + one-line descriptor, for OG cards and headers. */
export const LogoWide: React.FC = () => (
  <AbsoluteFill style={{ background: VOID, justifyContent: "center", alignItems: "center" }}>
    <Bloom />
    <Grid />
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 46, paddingLeft: 26 }}>
      <LogoMark size={196} />
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Wordmark size={112} mark={false} delay={-60} />
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 27,
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            color: "rgba(225,225,240,0.66)",
          }}
        >
          zero-custody recurring payments
        </div>
        <div style={{ height: 4, width: 470, background: GRAD, borderRadius: 99, opacity: 0.9 }} />
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 23,
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "rgba(225,225,240,0.45)",
          }}
        >
          solana · devnet
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

/**
 * Descriptor card used as a submission graphic: states the mechanism in one
 * line, because the mechanism is the product.
 */
export const BrandCard: React.FC = () => (
  <AbsoluteFill style={{ background: VOID, justifyContent: "center", alignItems: "center" }}>
    <Bloom />
    <Grid />
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 40,
        width: 1520,
        textAlign: "center",
      }}
    >
      <LogoMark size={168} />
      <GradText
        style={{
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 132,
          letterSpacing: "-0.035em",
          lineHeight: 1,
        }}
      >
        Iugis
      </GradText>
      <div
        style={{
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontWeight: 500,
          fontSize: 47,
          lineHeight: 1.34,
          color: "rgba(225,225,240,0.92)",
          maxWidth: 1300,
        }}
      >
        On-chain subscriptions where the subscriber approves a delegate capped at exactly one period.
      </div>
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 8,
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 25,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.mint,
        }}
      >
        <span>non-custodial</span>
        <span style={{ color: "rgba(225,225,240,0.28)" }}>·</span>
        <span>no unlimited allowance</span>
        <span style={{ color: "rgba(225,225,240,0.28)" }}>·</span>
        <span>revoke in one transaction</span>
      </div>
    </div>
  </AbsoluteFill>
);
