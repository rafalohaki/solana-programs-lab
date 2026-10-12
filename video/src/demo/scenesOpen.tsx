import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bg, C, GROTESK, MONO, easeIO } from "../kit";
import { CONTENT_BOTTOM, Mono, Panel, Pill, RiseWords, StatCard } from "./primitives";
import { byId } from "./timeline.generated";

// ---------------------------------------------------------------------------
// 1. COLD OPEN — wordmark + one-line value prop.
// ---------------------------------------------------------------------------
export const ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const mark = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 1.1 } });
  const line = spring({ frame: frame - 22, fps, config: { damping: 220 } });
  const tag = spring({ frame: frame - 44, fps, config: { damping: 220 } });
  const out = interpolate(durationInFrames - frame, [0, 10], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <Bg intensity={1.1} />

      {/* wordmark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 34,
          opacity: mark,
          transform: `scale(${interpolate(mark, [0, 1], [0.92, 1])}) translateY(${interpolate(mark, [0, 1], [26, 0])}px)`,
        }}
      >
        <div
          style={{
            width: 112,
            height: 112,
            borderRadius: 28,
            background: `linear-gradient(135deg, ${C.purple}, ${C.mint})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 110px rgba(153,69,255,0.55)",
          }}
        >
          {/* loop mark: recurring payment cycle */}
          <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
            <path
              d="M30 8a22 22 0 1 1-15.6 6.4"
              stroke="white"
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray="120"
              strokeDashoffset={interpolate(mark, [0, 1], [120, 0])}
            />
            <circle cx="15" cy="15" r="7" fill="white" />
          </svg>
        </div>
        <span style={{ fontFamily: GROTESK, fontSize: 118, fontWeight: 700, color: C.ink, letterSpacing: "-0.045em" }}>
          Onchain
          <span style={{ color: C.mint }}>SUB</span>
        </span>
      </div>

      {/* value prop */}
      <div style={{ marginTop: 62, opacity: line, transform: `translateY(${interpolate(line, [0, 1], [22, 0])}px)` }}>
        <RiseWords
          text="Zero-custody recurring payments on Solana."
          size={60}
          delay={24}
          align="center"
          color={C.ink}
        />
      </div>

      <div
        style={{
          marginTop: 46,
          display: "flex",
          gap: 18,
          opacity: tag,
          transform: `translateY(${interpolate(tag, [0, 1], [18, 0])}px)`,
        }}
      >
        <Pill text="funds stay in your wallet" color={C.mint} delay={46} />
        <Pill text="delegate capped at 1 period" color={C.cyan} delay={52} />
        <Pill text="cancel revokes in one tx" color={C.tint} delay={58} />
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 2. PROBLEM — card rails. Industry figures, labelled as such.
// ---------------------------------------------------------------------------
export const Problem: React.FC = () => {
  const timing = byId("02_problem");
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const head = spring({ frame: frame - 6, fps, config: { damping: 220 } });
  // One settlement bar crawling forward: T+2 is ~4% of a 52-day month.
  const bar = easeIO(interpolate(frame, [40, 105], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));

  return (
    <AbsoluteFill style={{ padding: "104px 150px" }}>
      <Bg intensity={0.85} />
      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [24, 0])}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 21, letterSpacing: "0.22em", textTransform: "uppercase", color: C.coral }}>
          subscriptions today · card rails
        </div>
        <div style={{ marginTop: 18 }}>
          <RiseWords text="Recurring billing is taxed twice." size={78} delay={8} />
        </div>
      </div>

      <div style={{ marginTop: 58, display: "flex", gap: 26 }}>
        <StatCard
          value="2.9% + 30¢"
          label="per charge, every period"
          sub="taken off the top of each renewal"
          color={C.coral}
          delay={26}
        />
        <StatCard value="T+2" label="days until settlement" sub="cash arrives after you earn it" color="#ff8a3d" delay={34} />
        <StatCard
          value="100%"
          label="card-on-file custody"
          sub="the merchant holds the payment credential"
          color="#ffd166"
          delay={42}
        />
      </div>

      {/* settlement timeline */}
      <Panel style={{ marginTop: 46 }} pad={30}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div style={{ minWidth: 250 }}>
            <div style={{ fontFamily: GROTESK, fontSize: 30, fontWeight: 700, color: C.ink }}>Settlement lag</div>
            <div style={{ marginTop: 6 }}>
              <Mono size={19} color={C.faint}>
                charge day, then two days of waiting
              </Mono>
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, borderRadius: 99, background: "rgba(225,225,240,0.10)", overflow: "hidden" }}>
              <div
                style={{
                  width: `${interpolate(bar, [0, 1], [0, 100])}%`,
                  height: "100%",
                  background: `linear-gradient(90deg, ${C.coral}, #ffd166)`,
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              <Mono size={18} color={C.dim}>
                charge
              </Mono>
              <Mono size={18} color={C.dim}>
                settled
              </Mono>
            </div>
          </div>
          <div style={{ minWidth: 420, textAlign: "right" }}>
            <Mono size={19} color={C.faint} style={{ lineHeight: 1.5 }}>
              Industry figures, not ours.
              <br />
              Card-network pricing; not OnchainSUB metrics.
            </Mono>
          </div>
        </div>
      </Panel>

      <div style={{ position: "absolute", top: CONTENT_BOTTOM - 24, left: 150 }}>
        <Mono size={19} color={C.faint} tracking="0.1em">
          Comparison basis: published card-network and processor pricing. {timing.eyebrow}
        </Mono>
      </div>
    </AbsoluteFill>
  );
};
