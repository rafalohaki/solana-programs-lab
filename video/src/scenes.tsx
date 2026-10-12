import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Bg,
  BrowserFrame,
  C,
  Eyebrow,
  GROTESK,
  KineticLine,
  MONO,
  Ticker,
  useEnter,
} from "./kit";

const pad: React.CSSProperties = { padding: "0 150px", justifyContent: "center", display: "flex", flexDirection: "column" };

// --- S1: cold open (0-5s) ------------------------------------------------------

export const SceneColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = interpolate(durationInFrames - frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const logo = useEnter(6, 100);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <Bg />
      <div style={{ textAlign: "center", opacity: logo.opacity, transform: `scale(${logo.scale})` }}>
        <div
          style={{
            width: 150,
            height: 150,
            margin: "0 auto 42px",
            borderRadius: 34,
            background: `linear-gradient(135deg, ${C.purple}, ${C.mint})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 120px rgba(153,69,255,0.55)",
            transform: `rotate(${interpolate(frame, [0, 90], [-8, 45])}deg)`,
          }}
        >
          <div style={{ width: 66, height: 66, border: "7px solid white", borderRadius: 15 }} />
        </div>
        <div style={{ transform: `translateY(${logo.y}px)` }}>
          <span style={{ fontFamily: GROTESK, fontSize: 132, fontWeight: 700, color: C.ink, letterSpacing: "-0.03em" }}>
            Subscriptions
            <span style={{ color: C.mint }}>.sol</span>
          </span>
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 110, width: "100%", display: "flex", justifyContent: "center" }}>
        <Eyebrow text="on-chain subscriptions · zero custody · solana devnet" delay={16} color={C.cyan} />
      </div>
    </AbsoluteFill>
  );
};

// --- S2: problem (5-11s) --------------------------------------------------------

const ProblemStat: React.FC<{ value: string; label: string; delay: number }> = ({ value, label, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{ opacity: e.opacity, transform: `translateY(${e.y}px)` }}>
      <span style={{ fontFamily: GROTESK, fontSize: 126, fontWeight: 700, color: C.coral, fontVariantNumeric: "tabular-nums" }}>{value}</span>
      <p style={{ fontFamily: MONO, fontSize: 21, color: C.dim, marginTop: 10, letterSpacing: "0.08em" }}>{label}</p>
    </div>
  );
};

export const SceneProblem: React.FC = () => (
  <AbsoluteFill style={{ ...pad }}>
    <Bg />
    <Eyebrow text="subscriptions today · card rails" color={C.coral} delay={2} />
    <div style={{ marginTop: 48 }}>
      <KineticLine text="Recurring billing is broken." size={90} delay={8} />
    </div>
    <div style={{ marginTop: 100, display: "flex", gap: 130 }}>
      <ProblemStat value="2.9% + 30¢" label="+ PER CHARGE, EVERY PERIOD" delay={16} />
      <ProblemStat value="T+7" label="DAYS UNTIL SETTLEMENT" delay={22} />
      <ProblemStat value="100%" label="CARD-ON-FILE CUSTODY" delay={28} />
    </div>
  </AbsoluteFill>
);

// --- S3: solution (11-19s) --------------------------------------------------------

const SolutionRow: React.FC<{ k: string; v: string; c: string; delay: number }> = ({ k, v, c, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 28, opacity: e.opacity, transform: `translateX(${e.y}px)` }}>
      <span style={{ fontFamily: MONO, fontSize: 25, color: c, textTransform: "uppercase", letterSpacing: "0.12em", width: 210 }}>{k}</span>
      <span style={{ fontFamily: GROTESK, fontSize: 46, color: C.ink }}>{v}</span>
    </div>
  );
};

export const SceneSolution: React.FC = () => (
  <AbsoluteFill style={{ ...pad }}>
    <Bg />
    <Eyebrow text="subscriptions.sol · model b" color={C.mint} delay={2} />
    <div style={{ marginTop: 48 }}>
      <KineticLine text="Delegation, not custody." size={92} delay={8} />
    </div>
    <div style={{ marginTop: 96, display: "flex", flexDirection: "column", gap: 42 }}>
      <SolutionRow k="delegate" v="approve capped at exactly 1 period" c={C.mint} delay={14} />
      <SolutionRow k="charge" v="1 atomic transaction per period · ~$0.000005" c={C.cyan} delay={20} />
      <SolutionRow k="fee" v="0.4% — an order below card rails" c={C.tint} delay={26} />
      <SolutionRow k="cancel" v="revoke settles in the same block" c={C.ink} delay={32} />
    </div>
  </AbsoluteFill>
);

// --- S4: product tour (19-59s) ------------------------------------------------------

export const SceneTour: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <BrowserFrame
      spec={{ src: "shots/hero.png", zoomStart: 2.6, zoomEnd: 1.12, focus: { x: 0.5, y: 0.2 }, caption: "live plans · on-chain proofs", duration: 105 }}
    />
  </AbsoluteFill>
);

export const SceneTour2: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <BrowserFrame
      spec={{ src: "shots/plans.png", zoomStart: 3.0, zoomEnd: 1.25, focus: { x: 0.5, y: 0.38 }, caption: "plan cards · delegate limits · protocol fee", duration: 100 }}
    />
  </AbsoluteFill>
);

export const SceneTour3: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <BrowserFrame
      spec={{ src: "shots/merchant-form.png", zoomStart: 1.8, zoomEnd: 1.0, focus: { x: 0.5, y: 0.35 }, caption: "merchant panel · batch invoicing · live preview", duration: 100 }}
    />
  </AbsoluteFill>
);

export const SceneTour4: React.FC = () => (
  <AbsoluteFill>
    <Bg />
    <BrowserFrame
      spec={{ src: "shots/delegate-flow.png", zoomStart: 1.5, zoomEnd: 1.02, focus: { x: 0.5, y: 0.5 }, caption: "delegate flow · every step verifiable", duration: 95 }}
    />
  </AbsoluteFill>
);

// --- S5: tech proof (59-69s) ---------------------------------------------------------

const TechRow: React.FC<{ n: string; t: string; c: string; delay: number }> = ({ n, t, c, delay }) => {
  const e = useEnter(delay);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: e.opacity, transform: `translateX(${e.y}px)` }}>
      <span style={{ fontFamily: MONO, fontSize: 20, color: C.faint }}>{n}</span>
      <span style={{ fontFamily: GROTESK, fontSize: 42, color: C.ink }}>{t}</span>
      <span style={{ marginLeft: "auto", width: 12, height: 12, borderRadius: 3, background: c, transform: "rotate(45deg)", boxShadow: `0 0 16px ${c}` }} />
    </div>
  );
};

export const SceneTech: React.FC = () => (
  <AbsoluteFill style={{ ...pad }}>
    <Bg />
    <Eyebrow text="built like infrastructure" color={C.tint} delay={2} />
    <div style={{ marginTop: 52 }}>
      <KineticLine text="Every claim, verifiable." size={88} delay={8} />
    </div>
    <div style={{ marginTop: 84, display: "flex", flexDirection: "column", gap: 38 }}>
      <TechRow n="01" t="Anchor program — deployed & verifiable on devnet" c={C.mint} delay={20} />
      <TechRow n="02" t="Ed25519 origin proof — checkout locked to your domain" c={C.cyan} delay={27} />
      <TechRow n="03" t="Blinks / Solana Actions — subscribe from X or Discord" c={C.purple} delay={34} />
      <TechRow n="04" t="Batch invoicing — up to 8 charges in one transaction" c={C.tint} delay={41} />
      <TechRow n="05" t="Self-hosted stack — RustFS CDN · Helius RPC · Redis" c="#7df4ff" delay={48} />
    </div>
  </AbsoluteFill>
);

// --- S6: team (69-84s) ------------------------------------------------------------

// Solo builder (teammates: []): RAFALO, Kraków/PL per /tmp/me.pretty.json.
export const SceneTeam: React.FC = () => (
  <AbsoluteFill style={{ ...pad }}>
    <Bg />
    <Eyebrow text="the builder · solo" color={C.mint} delay={2} />
    <div style={{ marginTop: 48 }}>
      <KineticLine text="One builder. Full-time." size={92} delay={8} />
    </div>
    <div style={{ marginTop: 96, display: "flex", flexDirection: "column", gap: 42 }}>
      <SolutionRow k="who" v="RAFALO — Kraków, PL" c={C.ink} delay={60} />
      <SolutionRow k="craft" v="backend + frontend · DeFi / payments" c={C.cyan} delay={130} />
      <SolutionRow k="mode" v="solo — full ownership, no handoffs" c={C.tint} delay={200} />
      <SolutionRow k="next" v="full-time after the hackathon" c={C.mint} delay={270} />
    </div>
  </AbsoluteFill>
);

// --- S7: outro (84-92s) -----------------------------------------------------------------

export const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = interpolate(durationInFrames - frame, [0, fps * 0.4], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const e = useEnter(4);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <Bg />
      <div style={{ textAlign: "center", opacity: e.opacity, transform: `translateY(${e.y}px)` }}>
        <p style={{ fontFamily: MONO, fontSize: 24, letterSpacing: "0.24em", textTransform: "uppercase", color: C.cyan, marginBottom: 34 }}>
          live now · solana devnet
        </p>
        <span style={{ fontFamily: GROTESK, fontSize: 118, fontWeight: 700, color: C.ink, letterSpacing: "-0.03em" }}>
          Subscriptions
          <span style={{ color: C.mint }}>.sol</span>
        </span>
        <p style={{ fontFamily: MONO, fontSize: 26, color: C.dim, marginTop: 38, letterSpacing: "0.1em" }}>
          solhack.rafal.si · github.com/rafalohaki
        </p>
        <p style={{ fontFamily: MONO, fontSize: 24, color: C.mint, marginTop: 26, letterSpacing: "0.14em" }}>
          built for the Colosseum Crypto World's Fair
        </p>
      </div>
      <p style={{ position: "absolute", bottom: 70, fontFamily: MONO, fontSize: 20, color: C.faint, letterSpacing: "0.08em" }}>
        delegate + transfer_checked · zero custody · funds stay in the wallet until charge day
      </p>
    </AbsoluteFill>
  );
};
