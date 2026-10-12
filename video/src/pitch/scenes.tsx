// Pitch video scenes — "OnchainSUB" (<=2 min, narration-led).
// Each scene's internal timing is anchored to its narration clip length so
// on-screen text lands with the voice rather than near it.
import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Video,
} from "remotion";
import {
  Bg,
  BrowserChrome,
  C,
  Eyebrow,
  Footnote,
  GradText,
  GRAD,
  HairGrid,
  KineticLine,
  LogoMark,
  MONO,
  GROTESK,
  Panel,
  Stage,
  Ticker,
  Wordmark,
  useEnter,
} from "./brand";

/** Extra frames each scene stays mounted so the next one can dissolve over it. */
export const OVERLAP = 12;

const pad: React.CSSProperties = {
  padding: "0 108px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

// ============================ S1 — cold open =================================
// Narration s1 (8.60s): the two bad options.
export const S1Hook: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const w = useEnter(8, 100);
  const t = useEnter(58, 90);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <Stage chapter="OnchainSUB · pitch">
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: -30 }}>
          <div style={{ opacity: w.opacity, transform: `translateY(${w.y}px)` }}>
            <Wordmark size={92} delay={6} />
          </div>
          <div
            style={{
              marginTop: 54,
              display: "flex",
              gap: 26,
              opacity: t.opacity,
              transform: `translateY(${t.y}px)`,
            }}
          >
            <Panel pad={30} style={{ width: 520 }} accent={C.coral}>
              <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.2em", color: C.coral, marginBottom: 16 }}>
                OPTION ONE
              </div>
              <div style={{ fontFamily: GROTESK, fontSize: 46, fontWeight: 700, color: C.ink, lineHeight: 1.15 }}>
                Lock funds in escrow
              </div>
              <div style={{ fontFamily: MONO, fontSize: 19, color: C.dim, marginTop: 16 }}>your money leaves your wallet</div>
            </Panel>
            <Panel pad={30} style={{ width: 520 }} accent={C.coral}>
              <div style={{ fontFamily: MONO, fontSize: 17, letterSpacing: "0.2em", color: C.coral, marginBottom: 16 }}>
                OPTION TWO
              </div>
              <div style={{ fontFamily: GROTESK, fontSize: 46, fontWeight: 700, color: C.ink, lineHeight: 1.15 }}>
                Grant unlimited allowance
              </div>
              <div style={{ fontFamily: MONO, fontSize: 19, color: C.dim, marginTop: 16 }}>and hope it behaves</div>
            </Panel>
          </div>
        </div>
        <Footnote text="subscriber-funded · merchant-pulled · one period at a time" delay={F(0.30)} />
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ S2 — problem ===================================
// Narration s2 (16.81s): card rails are expensive, slow, custodial.
const Stat: React.FC<{ value: string; label: string; sub: string; delay: number; color?: string }> = ({
  value,
  label,
  sub,
  delay,
  color = C.coral,
}) => {
  const e = useEnter(delay);
  return (
    <div style={{ opacity: e.opacity, transform: `translateY(${e.y}px)`, flex: 1 }}>
      <div style={{ fontFamily: GROTESK, fontSize: 92, fontWeight: 700, color, letterSpacing: "-0.03em" }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 19, letterSpacing: "0.16em", textTransform: "uppercase", color: C.ink, marginTop: 12 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 16, color: C.faint, marginTop: 8, letterSpacing: "0.04em" }}>{sub}</div>
    </div>
  );
};

export const S2Problem: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <HairGrid opacity={0.7} />
      <Stage chapter="the problem">
        <div style={{ ...pad, padding: 0, flex: 1, marginTop: -20 }}>
          <Eyebrow text="recurring billing today · card rails" color={C.coral} delay={2} />
          <div style={{ marginTop: 30 }}>
            <KineticLine text="Billing is expensive, slow, and custodial." size={72} delay={12} />
          </div>
          <div style={{ marginTop: 66, display: "flex", gap: 54 }}>
            <Stat value="~2.9% + $0.30" label="per successful charge" sub="industry figure, card networks" delay={F(0.13)} />
            <Stat value="~T+2" label="settlement, not instant" sub="funds clear days after" delay={F(0.32)} />
            <Stat value="100%" label="card stored on file" sub="a custodian holds the rail" delay={F(0.50)} />
          </div>
          <div style={{ marginTop: 62, opacity: interpolate(frame, [F(0.68), F(0.68) + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) }}>
            <Panel pad={30} style={{ maxWidth: 1180 }} accent={C.cyan}>
              <div style={{ fontFamily: GROTESK, fontSize: 34, color: C.ink, lineHeight: 1.35 }}>
                Crypto solved the <span style={{ color: C.cyan }}>transfer</span>. It never solved the{" "}
                <span style={{ color: C.mint }}>recurring pull</span>.
              </div>
            </Panel>
          </div>
        </div>
        <Footnote text="percentages and settlement windows are industry figures, not measured here" delay={F(0.18)} />
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ S3 — the mechanism =============================
// Narration s3 (22.21s): zero custody, one-period delegate, cancel = revoke.
export const S3Solution: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const rows = [
    { k: "01 · approve", v: "SPL delegate, capped at exactly one period", c: C.mint, d: 0.09 },
    { k: "02 · charge", v: "the program pulls one charge per period", c: C.cyan, d: 0.33 },
    { k: "03 · custody", v: "funds stay in your wallet until charge day", c: C.tint, d: 0.55 },
    { k: "04 · cancel", v: "one transaction revokes the delegate", c: C.ink, d: 0.77 },
  ];
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <Stage chapter="the mechanism">
        <div style={{ ...pad, padding: 0, flex: 1, marginTop: -20 }}>
          <Eyebrow text="model b · delegate + transfer_checked" color={C.mint} delay={2} />
          <div style={{ marginTop: 30 }}>
            <KineticLine text="Delegation, not custody." size={78} delay={10} />
          </div>
          <div style={{ marginTop: 58, display: "flex", flexDirection: "column", gap: 26 }}>
            {rows.map((r) => (
              <SolutionRow key={r.k} {...r} delay={Math.round(r.d * dur)} />
            ))}
          </div>
          <div
            style={{
              marginTop: 44,
              opacity: interpolate(frame, [F(0.85), F(0.85) + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <Footnote text="the program holds no funds and can only ever move the plan's fixed amount, once per period" />
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

const SolutionRow: React.FC<{ k: string; v: string; c: string; delay: number }> = ({ k, v, c, delay }) => {
  const e = useEnter(delay, 110);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 30,
        opacity: e.opacity,
        transform: `translateX(${interpolate(e.opacity, [0, 1], [-40, 0])}px)`,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 19,
          color: c,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          width: 190,
          flexShrink: 0,
        }}
      >
        {k}
      </span>
      <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
      <span style={{ fontFamily: GROTESK, fontSize: 40, color: C.ink, textAlign: "right", maxWidth: 900 }}>{v}</span>
    </div>
  );
};

// ============================ S4 — how a charge works ========================
// Narration s4 (23.45s): plan -> subscribe -> charge, no amount argument.
export const S4Flow: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const steps = [
    { n: "create_plan", who: "merchant", txt: "mint · amount · period", c: C.purple, d: 0.05 },
    { n: "subscribe", who: "subscriber", txt: "PDA + approve delegate", c: C.mint, d: 0.28 },
    { n: "charge", who: "merchant", txt: "transfer_checked, PDA-signed", c: C.cyan, d: 0.51 },
    { n: "cancel", who: "subscriber", txt: "revoke the delegate", c: C.coral, d: 0.77 },
  ];
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <HairGrid opacity={0.6} />
      <Stage chapter="how a charge works">
        <div style={{ ...pad, padding: 0, flex: 1, marginTop: -24 }}>
          <Eyebrow text="anchor program · solana devnet" color={C.purple} delay={2} />
          <div style={{ marginTop: 26 }}>
            <KineticLine text="Four instructions. No custody." size={64} delay={8} />
          </div>
          <div style={{ marginTop: 46, display: "flex", gap: 20, alignItems: "stretch" }}>
            {steps.map((s, i) => (
              <FlowStep key={s.n} {...s} delay={Math.round(s.d * dur)} last={i === steps.length - 1} />
            ))}
          </div>
          <div
            style={{
              marginTop: 46,
              display: "flex",
              gap: 20,
              opacity: interpolate(frame, [F(0.70), F(0.70) + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <Panel pad={26} accent={C.mint} style={{ flex: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.mint, letterSpacing: "0.16em" }}>OVERCHARGE PROOF</div>
              <div style={{ fontFamily: GROTESK, fontSize: 28, color: C.ink, marginTop: 10, lineHeight: 1.3 }}>
                <span style={{ fontFamily: MONO, fontSize: 26, color: C.tint }}>charge()</span> takes no amount argument — it reads
                the immutable plan
              </div>
            </Panel>
            <Panel pad={26} accent={C.cyan} style={{ flex: 1 }}>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.cyan, letterSpacing: "0.16em" }}>FEE</div>
              <div style={{ fontFamily: GROTESK, fontSize: 28, color: C.ink, marginTop: 10, lineHeight: 1.3 }}>
                <span style={{ color: C.mint }}>0.4%</span> protocol fee · ~$0.000005 network fee
              </div>
            </Panel>
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

const FlowStep: React.FC<{ n: string; who: string; txt: string; c: string; delay: number; last: boolean }> = ({
  n,
  who,
  txt,
  c,
  delay,
  last,
}) => {
  const e = useEnter(delay, 110);
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 20, opacity: e.opacity, transform: `translateY(${e.y}px)` }}>
      <Panel pad={24} style={{ flex: 1, minHeight: 218, borderColor: c + "55" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 12, height: 12, borderRadius: 3, background: c, boxShadow: `0 0 16px ${c}`, transform: "rotate(45deg)" }} />
          <span style={{ fontFamily: MONO, fontSize: 16, color: c, letterSpacing: "0.14em", textTransform: "uppercase" }}>{who}</span>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 27, color: C.ink, marginTop: 22, fontWeight: 500 }}>{n}</div>
        <div style={{ fontFamily: MONO, fontSize: 17, color: C.dim, marginTop: 14, lineHeight: 1.45 }}>{txt}</div>
      </Panel>
      {!last ? (
        <span style={{ fontFamily: GROTESK, fontSize: 34, color: "rgba(225,225,240,0.28)", flexShrink: 0 }}>→</span>
      ) : null}
    </div>
  );
};

// ============================ S5 — live product tour =========================
// Narration s5: it is live on devnet and the whole product is running.
// Six real captures of the deployed site, framed in browser chrome.
//
// Each stop lives in its own <Sequence> so its <Video> plays from local frame
// zero. Mounting them all at the scene root would leave later stops seeking past
// the end of their source clip and freezing on the last frame.
const TOUR = [
  { file: "plans", url: "solhack.rafal.si — live plans", label: "live plans read from chain" },
  { file: "checkout", url: "solhack.rafal.si/pay — protected checkout", label: "checkout · domain-bound, phishing blocked" },
  { file: "merchant", url: "solhack.rafal.si/merchant — merchant tools", label: "merchant tools · batch charging, invoicing, receipts" },
  { file: "blink", url: "solhack.rafal.si/blink — wallet actions", label: "wallet actions · Solana Blinks & QR" },
  { file: "manage", url: "solhack.rafal.si/manage — subscriber controls", label: "subscriber kill-switch, one click" },
  { file: "examples", url: "solhack.rafal.si/examples — embeddable widget", label: "embeddable checkout widget for any site" },
];

/** One tour stop: chrome + live capture, faded at its own edges. */
const TourStop: React.FC<{ file: string; url: string; duration: number }> = ({ file, url, duration }) => {
  const frame = useCurrentFrame();
  const o = Math.min(
    interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(duration - frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );
  return (
    <AbsoluteFill style={{ opacity: o, justifyContent: "center", alignItems: "center", paddingTop: 84 }}>
      <BrowserChrome url={url} width={1386} height={700} scaleFrom={1.0} scaleTo={1.045} enterAt={0}>
        <Video
          src={staticFile(`live-crop/${file}.mp4`)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          muted
        />
      </BrowserChrome>
    </AbsoluteFill>
  );
};

export const S5Live: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const intro = Math.round(1.2 * fps);
  const outro = Math.round(0.5 * fps);
  const tourDur = dur - intro - outro;
  const per = tourDur / TOUR.length;
  const active = Math.max(0, Math.min(TOUR.length - 1, Math.floor((frame - intro) / per)));
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <HairGrid opacity={0.5} />
      {TOUR.map((c, i) => {
        const from = intro + Math.round(per * i);
        const isLast = i === TOUR.length - 1;
        return (
          <Sequence key={c.file} from={from} durationInFrames={Math.round(per) + (isLast ? outro + 10 : 10)}>
            <TourStop file={c.file} url={c.url} duration={Math.round(per) + (isLast ? outro + 10 : 10)} />
          </Sequence>
        );
      })}
      <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 34, pointerEvents: "none" }}>
        <div
          style={{
            opacity: interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              background: "rgba(12,14,23,0.72)",
              border: "1px solid rgba(255,255,255,0.10)",
              borderRadius: 99,
              padding: "12px 26px",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ width: 9, height: 9, borderRadius: 99, background: C.mint, boxShadow: `0 0 16px ${C.mint}` }} />
            <span style={{ fontFamily: MONO, fontSize: 19, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink }}>
              live on devnet · not a mockup
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {TOUR.map((c, i) => (
              <div
                key={c.file}
                style={{
                  width: 54,
                  height: 4,
                  borderRadius: 99,
                  background: i <= active ? C.mint : "rgba(255,255,255,0.18)",
                  boxShadow: i === active ? `0 0 12px ${C.mint}` : "none",
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 16,
              letterSpacing: "0.16em",
              color: "rgba(225,225,240,0.6)",
              textTransform: "uppercase",
            }}
          >
            {TOUR[active].label}
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================ S6 — on-chain proof ============================
// Narration s5/s6 bridge: real deployed program, real successful charge.
export const S6Proof: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const e = useEnter(6, 90);
  const sig = "36faTWS…DUV9pcS";
  const pid = "2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw";
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <Stage chapter="verifiable on chain">
        <div style={{ ...pad, padding: 0, flex: 1, marginTop: -24 }}>
          <Eyebrow text="solana devnet · public accounts" color={C.mint} delay={2} />
          <div style={{ marginTop: 26 }}>
            <KineticLine text="Proof, not promises." size={70} delay={8} />
          </div>
          <div style={{ marginTop: 48, display: "flex", gap: 22, alignItems: "stretch" }}>
            <Panel pad={32} style={{ flex: 1.35, opacity: e.opacity, transform: `translateY(${e.y}px)` }} accent={C.mint}>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.mint, letterSpacing: "0.18em" }}>PROGRAM DEPLOYED · EXPLORER VERIFIABLE</div>
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 25,
                  color: C.ink,
                  marginTop: 18,
                  wordBreak: "break-all",
                  lineHeight: 1.45,
                }}
              >
                {pid.slice(0, 22)}
                <br />
                {pid.slice(22)}
              </div>
              <div style={{ display: "flex", gap: 34, marginTop: 30 }}>
                <div>
                  <div style={{ fontFamily: GROTESK, fontSize: 44, fontWeight: 700, color: C.mint }}>
                    <Ticker from={0} to={6} start={14} durationFrames={40} suffix="" />
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.dim, letterSpacing: "0.1em" }}>ON-CHAIN PLANS</div>
                </div>
                <div>
                  <div style={{ fontFamily: GROTESK, fontSize: 44, fontWeight: 700, color: C.cyan }}>
                    <Ticker from={0} to={24} start={18} durationFrames={40} />
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 15, color: C.dim, letterSpacing: "0.1em" }}>ANCHOR TESTS</div>
                </div>
              </div>
            </Panel>
            <Panel pad={32} style={{ flex: 1 }} accent={C.cyan}>
              <div style={{ fontFamily: MONO, fontSize: 16, color: C.cyan, letterSpacing: "0.18em" }}>REAL SUCCESSFUL CHARGE</div>
              <div style={{ fontFamily: MONO, fontSize: 23, color: C.ink, marginTop: 18 }}>{sig}</div>
              <div style={{ fontFamily: GROTESK, fontSize: 26, color: C.mint, marginTop: 22 }}>err: null</div>
              <div style={{ fontFamily: MONO, fontSize: 17, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
                log: Instruction: Charge
                <br />
                fee: 0.000005 SOL
              </div>
            </Panel>
          </div>
          <div
            style={{
              marginTop: 30,
              display: "flex",
              gap: 34,
              opacity: interpolate(frame, [F(0.60), F(0.60) + 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
            }}
          >
            <Footnote text="24 Anchor · 27 backend · 15 end-to-end tests" />
            <Footnote text="devnet only — no mainnet deployment claimed" color="rgba(225,225,240,0.28)" />
          </div>
        </div>
      </Stage>
    </AbsoluteFill>
  );
};

// ============================ S7 — builder ===================================
// Narration s6 (15.36s): solo builder, Kraków.
export const S7Builder: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const e = useEnter(8, 90);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <HairGrid opacity={0.55} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: e.opacity, transform: `translateY(${e.y}px)` }}>
          <Eyebrow text="the builder · solo" color={C.mint} delay={4} />
          <div style={{ marginTop: 30 }}>
            <KineticLine text="RAFALO — Kraków, Poland" size={82} delay={10} />
          </div>
          <div style={{ marginTop: 34, fontFamily: GROTESK, fontSize: 32, color: C.dim }}>
            On-chain program, backend, and frontend — <span style={{ color: C.ink }}>one builder, end to end</span>
          </div>
          <div
            style={{
              marginTop: 44,
              display: "flex",
              gap: 18,
              justifyContent: "center",
              opacity: interpolate(frame, [F(0.40), F(0.40) + 14], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {["Rust · Anchor", "Bun · Hono", "Astro · Svelte", "Postgres · Redis"].map((s) => (
              <span
                key={s}
                style={{
                  fontFamily: MONO,
                  fontSize: 19,
                  color: C.ink,
                  background: "rgba(40,41,52,0.9)",
                  border: "1px solid rgba(255,255,255,0.09)",
                  borderRadius: 99,
                  padding: "12px 24px",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <Footnote text="payments infrastructure built full-time for this hackathon" color="rgba(225,225,240,0.32)" delay={F(0.62)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================ S8 — close =====================================
export const S8Close: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // No fade-out here: the next scene dissolves in on top of this one, and the
  // compositor unmounts this scene once the overlap ends. Fading out as well
  // would make both layers translucent and dip the frame toward black.
  const out = 1;
  const F = (x: number) => Math.round(x * dur);
  const e = useEnter(4, 90);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Bg />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ textAlign: "center", opacity: e.opacity, transform: `translateY(${e.y}px)` }}>
          <LogoMark size={150} glow={1.3} />
          <div style={{ marginTop: 40 }}>
            <span
              style={{
                fontFamily: GROTESK,
                fontSize: 116,
                fontWeight: 700,
                letterSpacing: "-0.04em",
                color: C.ink,
                display: "inline-block",
              }}
            >
              Onchain<GradText>SUB</GradText>
            </span>
          </div>
          <div style={{ marginTop: 24, fontFamily: MONO, fontSize: 27, letterSpacing: "0.12em", color: C.ink }}>
            zero-custody recurring payments on Solana
          </div>
          <div style={{ marginTop: 46, display: "flex", gap: 16, justifyContent: "center" }}>
            {[
              { k: "live", v: "solhack.rafal.si", c: C.mint },
              { k: "chain", v: "Solana devnet", c: C.cyan },
              { k: "builder", v: "solo · Kraków PL", c: C.tint },
            ].map((x) => (
              <Panel key={x.k} pad={22} style={{ minWidth: 300 }}>
                <div style={{ fontFamily: MONO, fontSize: 15, letterSpacing: "0.2em", color: x.c, textTransform: "uppercase" }}>{x.k}</div>
                <div style={{ fontFamily: MONO, fontSize: 23, color: C.ink, marginTop: 10 }}>{x.v}</div>
              </Panel>
            ))}
          </div>
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end" }}>
        <Footnote text="funds stay in the subscriber's wallet until charge day" color="rgba(225,225,240,0.30)" delay={F(0.55)} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================ audio helper ==================================
/** Narration clip placed at a scene-local offset. */
export const Line: React.FC<{ name: string; at?: number; volume?: number }> = ({ name, at = 0, volume = 1 }) => (
  <Audio src={staticFile(`audio/pitch/${name}.wav`)} startFrom={0} volume={volume} />
);
