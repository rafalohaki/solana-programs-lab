import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bg, C, GROTESK, MONO } from "../kit";
import { CONTENT_BOTTOM, Mono, Panel, RiseWords } from "./primitives";
import { byId } from "./timeline.generated";

// ---------------------------------------------------------------------------
// 3. MECHANISM — the real instruction flow, phase-synced to the narration.
//    Phases are the spoken beats synthesized by make_demo_audio.py, so the
//    animation lands on the argument rather than on a guessed schedule.
// ---------------------------------------------------------------------------

// Beat frames are injected from timeline.generated.ts at module load (see
// STEP_META below); never hardcode them, or picture and voice will drift.
const STEPS = [
  {
    n: "01",
    key: "create_plan",
    title: "Create plan",
    who: "merchant",
    color: C.tint,
    at: 0,
    lines: [
      { k: "call", v: "create_plan(plan_id, amount, period_seconds)" },
      { k: "pda", v: '["plan", merchant, plan_id u64 LE]' },
      { k: "result", v: "amount + period written once, immutable" },
    ],
    note: "The price is fixed on-chain at plan creation. There is no later call that can raise it.",
  },
  {
    n: "02",
    key: "subscribe",
    title: "Approve + subscribe",
    who: "subscriber",
    color: C.cyan,
    at: 0,
    lines: [
      { k: "call", v: "approve(Subscription PDA, cap = 1 period)" },
      { k: "call", v: "subscribe()" },
      { k: "pda", v: '["sub", plan, subscriber]' },
    ],
    note: "The delegate allowance is exactly one period, so no single charge can take more than the plan amount.",
  },
  {
    n: "03",
    key: "charge",
    title: "Charge",
    who: "merchant",
    color: C.mint,
    at: 0,
    lines: [
      { k: "call", v: "charge()   ← takes NO amount argument" },
      { k: "reads", v: "amount := plan.amount (immutable)" },
      { k: "cpi", v: "transfer_checked, signed by Subscription PDA" },
      { k: "fee", v: "40 bps → treasury (hardcoded)" },
    ],
    note: "Because charge() cannot receive an amount, the program cannot be told to overcharge. The guarantee is structural, not a policy.",
  },
  {
    n: "04",
    key: "cancel",
    title: "Cancel",
    who: "subscriber only",
    color: "#ff8a3d",
    at: 0,
    lines: [
      { k: "call", v: "cancel()" },
      { k: "effect", v: "revokes the SPL-Token delegate" },
      { k: "design", v: "best-effort, so it can never be bricked" },
    ],
    note: "Funds stay in the subscriber's wallet until charge day. Until then the merchant has an allowance, never custody.",
  },
];

// Beat frames come straight from the generated cut sheet (scene-relative), so
// each card activates exactly when the narration reaches its argument.
const MECH_BEATS = byId("03_mechanism").beats ?? [];
STEPS.forEach((s, i) => {
  s.at = MECH_BEATS[i]?.frame ?? 0;
});
// Give the flow a short lead-in so card 01 is already on screen when it starts.
const LEAD = 0;
if (MECH_BEATS[0]) STEPS[0].at = MECH_BEATS[0].frame - LEAD;

const CARD_W = 414;
const GAP = 22;

const StepCard: React.FC<{ step: (typeof STEPS)[number]; i: number; active: boolean; done: boolean }> = ({
  step,
  i,
  active,
  done,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - step.at, fps, config: { damping: 210, mass: 0.9 } });
  const glow = active ? 1 : done ? 0.4 : 0;

  return (
    <div
      style={{
        width: CARD_W,
        height: 186,
        borderRadius: 18,
        padding: "22px 24px",
        background: active ? "rgba(25,27,37,0.94)" : "rgba(25,27,37,0.55)",
        border: `1px solid ${active ? step.color : "rgba(255,255,255,0.11)"}`,
        boxShadow: active ? `0 0 70px ${step.color}33` : "none",
        opacity: interpolate(e, [0, 1], [0.35, 1]),
        transform: `translateY(${interpolate(e, [0, 1], [26, 0])}px) scale(${interpolate(e, [0, 1], [0.97, 1])})`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Mono size={19} color={step.color} tracking="0.16em">
          {step.n}
        </Mono>
        <div style={{ fontFamily: GROTESK, fontSize: 29, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
          {step.title}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {(done || active) && (
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 99,
                background: done ? step.color : "transparent",
                border: `2px solid ${step.color}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                color: "#0c0e17",
                fontWeight: 900,
              }}
            >
              {done ? "✓" : ""}
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: 12, fontFamily: MONO, fontSize: 17, color: step.color, letterSpacing: "0.06em" }}>
        {step.who}
      </div>

      {/* mini PDA/instruction stack, revealed as the card activates */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
        {step.lines.slice(0, 2).map((l, j) => {
          const le = interpolate(frame, [step.at + 8 + j * 7, step.at + 20 + j * 7], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          return (
            <div key={j} style={{ display: "flex", gap: 10, opacity: le }}>
              <Mono size={13} color={C.faint} tracking="0.1em" style={{ width: 54 }}>
                {l.k}
              </Mono>
              <Mono size={15} color={active ? C.ink : C.dim} style={{ flex: 1 }}>
                {l.v}
              </Mono>
            </div>
          );
        })}
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: 3,
          width: `${glow * 100}%`,
          background: step.color,
        }}
      />
    </div>
  );
};

const Connector: React.FC<{ after: number; active: boolean; color: string }> = ({ after, active, color }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [after, after + 26], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{ width: GAP, height: 186, position: "relative", flexShrink: 0 }}>
      <div
        style={{
          position: "absolute",
          top: 93,
          left: 0,
          right: 0,
          height: 2,
          background: "rgba(225,225,240,0.14)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 93,
          left: 0,
          width: `${t * 100}%`,
          height: 2,
          background: color,
        }}
      />
      {active && (
        <div
          style={{
            position: "absolute",
            top: 87,
            left: `${((frame - after) % 40) / 40 * 100}%`,
            width: 10,
            height: 10,
            marginLeft: -5,
            borderRadius: 99,
            background: color,
            boxShadow: `0 0 16px ${color}`,
          }}
        />
      )}
    </div>
  );
};

export const Mechanism: React.FC = () => {
  const timing = byId("03_mechanism");
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let active = 0;
  for (let i = 0; i < STEPS.length; i++) if (frame >= STEPS[i].at) active = i;
  const step = STEPS[active];

  const head = spring({ frame: frame - 2, fps, config: { damping: 220 } });
  const detail = interpolate(frame, [step.at, step.at + 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ padding: "70px 100px 0" }}>
      <Bg intensity={0.75} />

      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [20, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 21, letterSpacing: "0.22em", textTransform: "uppercase", color: C.mint }}>
              model b · delegate, not custody
            </div>
            <div style={{ marginTop: 14 }}>
              <RiseWords text="Four calls. No custody." size={68} delay={4} />
            </div>
          </div>
          <Mono size={20} color={C.faint} tracking="0.14em" caps>
            anchor 0.31.1 · spl token · devnet
          </Mono>
        </div>
      </div>

      {/* step flow */}
      <div style={{ display: "flex", marginTop: 44, alignItems: "flex-start" }}>
        {STEPS.map((s, i) => (
          <React.Fragment key={s.key}>
            {i > 0 && <Connector after={s.at} active={i <= active} color={s.color} />}
            <StepCard step={s} i={i} active={i === active} done={i < active} />
          </React.Fragment>
        ))}
      </div>

      {/* detail for the active step */}
      <div style={{ position: "relative", marginTop: 30, height: 470 }}>
        <Panel
          style={{
            position: "absolute",
            inset: 0,
            borderColor: `${step.color}44`,
            boxShadow: `0 0 80px ${step.color}18`,
          }}
          pad={38}
        >
          <div style={{ display: "flex", gap: 46, height: "100%" }}>
            {/* code side */}
            <div style={{ width: 900 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <Mono size={19} color={step.color} tracking="0.2em" caps>
                  {step.n} · {step.title}
                </Mono>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
              </div>
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 18 }}>
                {step.lines.map((l, j) => {
                  const le = interpolate(frame, [step.at + 12 + j * 9, step.at + 26 + j * 9], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  return (
                    <div
                      key={j}
                      style={{
                        display: "flex",
                        gap: 20,
                        opacity: le,
                        transform: `translateX(${interpolate(le, [0, 1], [16, 0])}px)`,
                        alignItems: "baseline",
                      }}
                    >
                      <Mono size={17} color={step.color} tracking="0.14em" caps style={{ width: 92, flexShrink: 0 }}>
                        {l.k}
                      </Mono>
                      <Mono size={27} color={C.ink} style={{ letterSpacing: "0.01em" }}>
                        {l.v}
                      </Mono>
                    </div>
                  );
                })}
              </div>

              {/* the structural guarantee, callout on the charge step */}
              <div
                style={{
                  marginTop: 26,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  opacity: active === 2 ? detail : 0.25,
                }}
              >
                <div style={{ width: 10, height: 10, background: C.mint, transform: "rotate(45deg)", flexShrink: 0 }} />
                <Mono size={20} color={active === 2 ? C.mint : C.faint}>
                  No amount parameter exists on charge() — overcharge is not expressible.
                </Mono>
              </div>
            </div>

            {/* explanation side */}
            <div style={{ flex: 1, borderLeft: "1px solid rgba(255,255,255,0.09)", paddingLeft: 40 }}>
              <Mono size={19} color={C.faint} tracking="0.2em" caps>
                what this buys you
              </Mono>
              <div style={{ marginTop: 22, opacity: detail, transform: `translateY(${interpolate(detail, [0, 1], [14, 0])}px)` }}>
                <div style={{ fontFamily: GROTESK, fontSize: 32, color: C.ink, lineHeight: 1.34, fontWeight: 500 }}>
                  {step.note}
                </div>
              </div>

              <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  ["custody", "subscriber wallet"],
                  ["merchant holds", "an allowance, capped"],
                  ["protocol fee", "0.4% (FEE_BPS = 40)"],
                ].map(([k, v], j) => {
                  const le = interpolate(frame, [step.at + 30 + j * 8, step.at + 44 + j * 8], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  });
                  return (
                    <div key={k} style={{ display: "flex", gap: 14, opacity: le }}>
                      <Mono size={16} color={C.faint} tracking="0.1em" caps style={{ width: 168 }}>
                        {k}
                      </Mono>
                      <Mono size={19} color={C.dim}>
                        {v}
                      </Mono>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ position: "absolute", top: CONTENT_BOTTOM - 30, left: 100 }}>
        <Mono size={18} color={C.faint} tracking="0.1em">
          Instructions: create_plan · subscribe · charge · cancel · create_invoice · charge_invoice · void_invoice
        </Mono>
      </div>
      <div style={{ position: "absolute", top: CONTENT_BOTTOM - 30, right: 100 }}>
        <Mono size={18} color={C.faint} tracking="0.1em">
          {timing.label}
        </Mono>
      </div>
    </AbsoluteFill>
  );
};
