import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Bg, C, GROTESK, MONO } from "../kit";
import { CONTENT_BOTTOM, Mono, Panel, RiseWords } from "./primitives";
import { byId } from "./timeline.generated";

const PROGRAM_ID = "2jK5cy3PaCnD2cLfp3VCqxySBx4dyDhBc7GuutACvJuw";
const TX_SIG = "36faTWSe9Bwkug7Xkcdaeaazo1SzTJJ1xcmJuyC8yBho3u3AWBdsiG7tVyE7HWdvP3rqD8nQanRfDrPNGDUV9pcS";

/** Chunk a long base58 string into readable groups without changing its value. */
const group = (s: string, n = 4): string => s.replace(new RegExp(`(.{${n}})`, "g"), "$1 ").trim();

const Check: React.FC<{ delay: number; color: string }> = ({ delay, color }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return (
    <div
      style={{
        width: 30,
        height: 30,
        borderRadius: 99,
        background: color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#0c0e17",
        fontWeight: 900,
        fontSize: 18,
        transform: `scale(${e})`,
        flexShrink: 0,
      }}
    >
      ✓
    </div>
  );
};

const KV: React.FC<{ k: string; v: string; color?: string; delay: number; mono?: boolean }> = ({
  k,
  v,
  color = C.ink,
  delay,
  mono = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - delay, fps, config: { damping: 220 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 18,
        opacity: e,
        transform: `translateX(${interpolate(e, [0, 1], [18, 0])}px)`,
      }}
    >
      <Mono size={17} color={C.faint} tracking="0.14em" caps style={{ width: 190, flexShrink: 0 }}>
        {k}
      </Mono>
      <span
        style={{
          fontFamily: mono ? MONO : GROTESK,
          fontSize: mono ? 24 : 30,
          color,
          letterSpacing: mono ? "0.02em" : "-0.02em",
          wordBreak: "break-all",
        }}
      >
        {v}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// 5. ON-CHAIN PROOF — every claim here is checkable on devnet.
// ---------------------------------------------------------------------------
export const Proof: React.FC = () => {
  const timing = byId("12_proof");
  const beats = timing.beats ?? [];
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const at = (i: number, fallback: number) => beats[i]?.frame ?? fallback;

  const head = spring({ frame: frame - 2, fps, config: { damping: 220 } });
  // signature "typing" reveal across beat 3
  const sigStart = at(2, 220);
  const sigReveal = interpolate(frame, [sigStart + 26, sigStart + 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const sigChars = Math.floor(sigReveal * TX_SIG.length);

  const honesty = interpolate(frame, [at(3, 400), at(3, 400) + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const tests = interpolate(frame, [at(4, 579), at(4, 579) + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ padding: "66px 100px 0" }}>
      <Bg intensity={0.8} />

      <div style={{ opacity: head, transform: `translateY(${interpolate(head, [0, 1], [20, 0])}px)` }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 21, letterSpacing: "0.22em", textTransform: "uppercase", color: C.cyan }}>
              on-chain proof · solana devnet
            </div>
            <div style={{ marginTop: 14 }}>
              <RiseWords text="Check it yourself." size={72} delay={4} />
            </div>
          </div>
          <Mono size={20} color={C.faint} tracking="0.14em" caps>
            anchor 0.31.1 · spl token (classic) · executable
          </Mono>
        </div>
      </div>

      <div style={{ display: "flex", gap: 24, marginTop: 34, height: 690 }}>
        {/* left: program + tx */}
        <Panel style={{ flex: 1.32, borderColor: `${C.mint}3a`, boxShadow: `0 0 80px ${C.mint}14` }} pad={34}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Check delay={at(0, 10) + 8} color={C.mint} />
            <Mono size={19} color={C.mint} tracking="0.2em" caps>
              deployed and executable on devnet
            </Mono>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
            <Mono size={17} color={C.faint} tracking="0.14em" caps>
              anchor program
            </Mono>
          </div>

          <div style={{ marginTop: 26 }}>
            <Mono size={17} color={C.faint} tracking="0.14em" caps>
              program id
            </Mono>
            <div
              style={{
                marginTop: 12,
                fontFamily: MONO,
                fontSize: 30,
                color: C.ink,
                letterSpacing: "0.02em",
                lineHeight: 1.5,
                wordBreak: "break-all",
              }}
            >
              {group(PROGRAM_ID)}
            </div>
          </div>

          <div style={{ marginTop: 34, display: "flex", alignItems: "center", gap: 14 }}>
            <Check delay={at(2, 220) + 10} color={C.mint} />
            <Mono size={19} color={C.mint} tracking="0.2em" caps>
              real charge transaction
            </Mono>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
            <Mono size={17} color={C.faint} tracking="0.14em" caps>
              confirmed
            </Mono>
          </div>

          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 14 }}>
            <KV k="err" v="null" color={C.mint} delay={at(2, 220) + 14} />
            <KV k="log" v={`"Instruction: Charge"`} color={C.mint} delay={at(2, 220) + 20} />
            <KV k="network fee" v="5,000 lamports (0.000005 SOL)" color={C.ink} delay={at(2, 220) + 26} />
            <KV k="amount arg" v="none — read from the immutable plan" color={C.cyan} delay={at(2, 220) + 32} />
          </div>

          <div style={{ marginTop: 26 }}>
            <Mono size={17} color={C.faint} tracking="0.14em" caps>
              transaction signature
            </Mono>
            <div
              style={{
                marginTop: 10,
                fontFamily: MONO,
                fontSize: 16,
                color: C.dim,
                wordBreak: "break-all",
                lineHeight: 1.6,
                minHeight: 78,
              }}
            >
              {TX_SIG.slice(0, sigChars)}
              <span style={{ color: C.mint, opacity: sigReveal < 1 ? 1 : 0 }}>▌</span>
            </div>
          </div>
        </Panel>

        {/* right: honesty + tests */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
          <Panel style={{ borderColor: "rgba(255,209,102,0.45)", background: "rgba(255,209,102,0.06)" }} pad={30}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 10, height: 10, background: "#ffd166", transform: "rotate(45deg)" }} />
              <Mono size={18} color="#ffd166" tracking="0.2em" caps>
                honest traction
              </Mono>
            </div>
            <div
              style={{
                marginTop: 18,
                fontFamily: GROTESK,
                fontSize: 30,
                color: C.ink,
                lineHeight: 1.42,
                fontWeight: 500,
                opacity: honesty,
                transform: `translateY(${interpolate(honesty, [0, 1], [12, 0])}px)`,
              }}
            >
              Two demo charges of a throwaway test mint. One merchant. Zero third-party users, zero revenue. Devnet only.
            </div>
          </Panel>

          <Panel style={{ flex: 1 }} pad={30}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Mono size={18} color={C.mint} tracking="0.2em" caps>
                test coverage
              </Mono>
              <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.10)" }} />
            </div>
            <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 20, opacity: tests }}>
              {[
                ["24", "Anchor tests", "solana-bankrun, program-level"],
                ["27", "backend tests", "Bun + Hono service layer"],
                ["15", "end-to-end tests", "Playwright against the live app"],
              ].map(([n, t, s], i) => {
                const e = spring({ frame: frame - at(4, 579) - i * 6, fps, config: { damping: 210 } });
                return (
                  <div
                    key={t}
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 22,
                      opacity: e,
                      transform: `translateX(${interpolate(e, [0, 1], [16, 0])}px)`,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: GROTESK,
                        fontSize: 62,
                        fontWeight: 700,
                        color: C.mint,
                        minWidth: 92,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}
                    >
                      {n}
                    </span>
                    <div>
                      <div style={{ fontFamily: GROTESK, fontSize: 27, color: C.ink, fontWeight: 500 }}>{t}</div>
                      <Mono size={16} color={C.faint}>
                        {s}
                      </Mono>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 26, borderTop: "1px solid rgba(255,255,255,0.09)", paddingTop: 20 }}>
              <Mono size={17} color={C.faint} style={{ lineHeight: 1.6 }}>
                Stack: Anchor · Bun + Hono · Postgres + Redis · Astro 5 + Svelte 5 · Docker Compose · Helius RPC
              </Mono>
            </div>
          </Panel>
        </div>
      </div>

      <div style={{ position: "absolute", top: CONTENT_BOTTOM - 30, left: 100 }}>
        <Mono size={18} color={C.faint} tracking="0.1em">
          explorer.solana.com/address/{PROGRAM_ID.slice(0, 12)}…?cluster=devnet
        </Mono>
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// 6. CLOSE — brand, live URL, devnet label, solo builder.
// ---------------------------------------------------------------------------
export const Close: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = interpolate(durationInFrames - frame, [0, 26], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const mark = spring({ frame: frame - 4, fps, config: { damping: 200, mass: 1.1 } });
  const url = spring({ frame: frame - 30, fps, config: { damping: 220 } });
  const who = spring({ frame: frame - 60, fps, config: { damping: 220 } });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: out }}>
      <Bg intensity={1.05} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 30,
          opacity: mark,
          transform: `scale(${interpolate(mark, [0, 1], [0.94, 1])})`,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${C.purple}, ${C.mint})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 0 100px rgba(153,69,255,0.5)",
          }}
        >
          <svg width="52" height="52" viewBox="0 0 60 60" fill="none">
            <path d="M30 8a22 22 0 1 1-15.6 6.4" stroke="white" strokeWidth="7" strokeLinecap="round" />
            <circle cx="15" cy="15" r="7" fill="white" />
          </svg>
        </div>
        <span style={{ fontFamily: GROTESK, fontSize: 122, fontWeight: 700, color: C.ink, letterSpacing: "-0.045em" }}>
          Onchain
          <span style={{ color: C.mint }}>SUB</span>
        </span>
      </div>

      <div
        style={{
          marginTop: 54,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: url,
          transform: `translateY(${interpolate(url, [0, 1], [20, 0])}px)`,
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: 99, background: C.mint, boxShadow: `0 0 18px ${C.mint}` }} />
        <span style={{ fontFamily: GROTESK, fontSize: 54, fontWeight: 500, color: C.ink, letterSpacing: "-0.02em" }}>
          solhack.rafal.si
        </span>
        <Mono size={22} color={C.mint} tracking="0.18em" caps>
          live · devnet
        </Mono>
      </div>

      <div
        style={{
          marginTop: 34,
          opacity: who,
          transform: `translateY(${interpolate(who, [0, 1], [16, 0])}px)`,
          textAlign: "center",
        }}
      >
        <Mono size={25} color={C.dim} tracking="0.1em">
          Solo builder: RAFALO — Kraków, PL
        </Mono>
      </div>

      <div style={{ position: "absolute", bottom: 96, textAlign: "center", width: "100%" }}>
        <Mono size={22} color={C.ink} tracking="0.08em">
          Recurring payments, settled on chain. Funds never leave the subscriber's wallet.
        </Mono>
        <div style={{ marginTop: 16 }}>
          <Mono size={19} color={C.faint} tracking="0.12em" caps>
            Demo build on Solana devnet · demo data only · no mainnet, no paying customers, no revenue claimed
          </Mono>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export { PROGRAM_ID, TX_SIG };
