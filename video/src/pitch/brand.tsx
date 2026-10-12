// Brand system for the OnchainSUB pitch video.
// Deliberately colocated with ./scenes so the concurrently-built demo
// composition can import ../kit without these files ever changing under it.
import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export { C, GROTESK, MONO, FPS, WIDTH, HEIGHT, easeIO, Bg, useEnter, KineticLine, Eyebrow, Ticker } from "../kit";

export const GRAD = "linear-gradient(92deg, #9945FF 5%, #00dbe9 50%, #14F195 95%)";

/** Gradient-filled text (the site's .grad-text equivalent). */
export const GradText: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <span
    style={{
      backgroundImage: GRAD,
      WebkitBackgroundClip: "text",
      backgroundClip: "text",
      color: "transparent",
      ...style,
    }}
  >
    {children}
  </span>
);

/**
 * OnchainSUB mark: a recurring-cycle diamond ring around a solid core, the
 * motif the product already uses, with the brand gradient on a 135deg diagonal.
 */
export const LogoMark: React.FC<{ size?: number; spin?: number; glow?: number }> = ({
  size = 132,
  spin = 0,
  glow = 1,
}) => {
  const frame = useCurrentFrame();
  const rot = spin ? interpolate(frame, [0, 240], [0, spin]) : 0;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.23,
        background: "#11131d",
        border: "1px solid rgba(255,255,255,0.10)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: `0 24px 70px rgba(0,0,0,0.55), 0 0 ${size * 0.7}px rgba(153,69,255,${0.30 * glow})`,
        transform: `rotate(${rot}deg)`,
        flexShrink: 0,
      }}
    >
      <svg width={size * 0.78} height={size * 0.78} viewBox="0 0 64 64">
        <defs>
          <linearGradient id="pitch-mark-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9945FF" />
            <stop offset="0.5" stopColor="#00dbe9" />
            <stop offset="1" stopColor="#14F195" />
          </linearGradient>
        </defs>
        <path
          d="M32 8 L56 32 L32 56 L8 32 Z"
          fill="none"
          stroke="url(#pitch-mark-g)"
          strokeWidth="7"
          strokeLinejoin="round"
        />
        <path d="M32 23 L41 32 L32 41 L23 32 Z" fill="#FFFFFF" />
      </svg>
    </div>
  );
};

/** OnchainSUB wordmark lockup. */
export const Wordmark: React.FC<{ size?: number; delay?: number; mark?: boolean }> = ({
  size = 76,
  delay = 0,
  mark = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 220 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: size * 0.3,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
      }}
    >
      {mark ? <LogoMark size={size * 1.15} /> : null}
      <span
        style={{
          fontFamily: "'Space Grotesk', system-ui, sans-serif",
          fontSize: size,
          fontWeight: 700,
          letterSpacing: "-0.035em",
          color: "#e1e1f0",
        }}
      >
        Onchain
        <GradText>SUB</GradText>
      </span>
    </div>
  );
};

/** Glass panel — the single surface primitive every scene composes from. */
export const Panel: React.FC<{
  children?: React.ReactNode;
  style?: React.CSSProperties;
  pad?: number;
  accent?: string;
}> = ({ children, style, pad = 34, accent }) => (
  <div
    style={{
      background: "linear-gradient(160deg, rgba(29,31,41,0.92), rgba(12,14,23,0.92))",
      border: `1px solid ${accent ? accent + "44" : "rgba(255,255,255,0.09)"}`,
      borderRadius: 22,
      padding: pad,
      boxShadow: "0 30px 90px rgba(0,0,0,0.5)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Fine hairline grid, tuned to sit under text without competing with it. */
export const HairGrid: React.FC<{ opacity?: number; size?: number }> = ({ opacity = 1, size = 68 }) => (
  <AbsoluteFill
    style={{
      backgroundImage:
        "linear-gradient(rgba(255,255,255,0.028) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.028) 1px, transparent 1px)",
      backgroundSize: `${size}px ${size}px`,
      opacity,
    }}
  />
);

/** Scene furniture: consistent safe-margin frame + persistent wordmark chip. */
export const Stage: React.FC<{
  children: React.ReactNode;
  chapter?: string;
  brandChip?: boolean;
}> = ({ children, chapter, brandChip = true }) => (
  <AbsoluteFill style={{ padding: "64px 108px" }}>
    {brandChip ? (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <LogoMark size={46} />
          <span
            style={{
              fontFamily: "'Space Grotesk', system-ui, sans-serif",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "rgba(225,225,240,0.92)",
            }}
          >
            Onchain<GradText>SUB</GradText>
          </span>
        </div>
        {chapter ? (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 17,
              letterSpacing: "0.26em",
              textTransform: "uppercase",
              color: "rgba(225,225,240,0.34)",
            }}
          >
            {chapter}
          </span>
        ) : null}
      </div>
    ) : null}
    {children}
  </AbsoluteFill>
);

/**
 * Live product footage in browser chrome. The captured sequences are already
 * smooth scroll animations, so this only frames them (fit-width + an optional
 * slow push) rather than adding a second, competing camera move.
 */
export const BrowserChrome: React.FC<{
  url: string;
  label?: string;
  width?: number;
  height?: number;
  scaleFrom?: number;
  scaleTo?: number;
  children: React.ReactNode;
  enterAt?: number;
}> = ({ url, label, width = 1320, height = 742, scaleFrom = 1, scaleTo = 1.04, children, enterAt = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - enterAt, fps, config: { damping: 220 } });
  const zoom = interpolate(frame - enterAt, [0, 300], [scaleFrom, scaleTo], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        width,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px)`,
      }}
    >
      <div
        style={{
          borderRadius: 20,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "#0c0e17",
          boxShadow: "0 60px 160px rgba(0,0,0,0.68), 0 0 130px rgba(153,69,255,0.15)",
        }}
      >
        <div
          style={{
            height: 46,
            background: "#1a1c26",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "0 16px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, opacity: 0.85 }} />
          ))}
          <div
            style={{
              marginLeft: 14,
              flex: 1,
              maxWidth: 620,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 7,
              padding: "5px 13px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 15,
              color: "rgba(225,225,240,0.5)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {url}
          </div>
        </div>
        <div style={{ position: "relative", width: "100%", height, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `scale(${zoom})`,
              transformOrigin: "50% 42%",
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {label ? (
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
          <div style={{ width: 9, height: 9, borderRadius: 99, background: "#14F195", boxShadow: "0 0 16px #14F195" }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 19,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgba(225,225,240,0.72)",
            }}
          >
            {label}
          </span>
        </div>
      ) : null}
    </div>
  );
};

/** Footnote / honesty marker, kept visually distinct from marketing copy. */
export const Footnote: React.FC<{ text: string; delay?: number; color?: string }> = ({
  text,
  delay = 0,
  color = "rgba(225,225,240,0.34)",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 220 } });
  return (
    <div
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 16,
        letterSpacing: "0.05em",
        color,
        opacity: s,
      }}
    >
      {text}
    </div>
  );
};

/**
 * Burned-in captions.
 *
 * A significant share of judges watch submissions muted, so the narration is
 * also rendered as text. Words are chunked to a readable length and each chunk
 * gets time proportional to its character count within the line, which tracks
 * speech pace far better than even splits.
 */
const chunkLine = (text: string, maxChars = 46): string[] => {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > maxChars) {
      out.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) out.push(cur);
  return out;
};

export const CaptionTrack: React.FC<{
  /** Narration text for the current scene. */
  text: string;
  /**
   * Length of the *spoken clip* in frames.
   *
   * This is deliberately not the scene length: the live-tour scene runs far
   * longer than its narration to give the footage room, and pacing captions off
   * the scene length would smear each line across the extra seconds and repeat
   * it on screen.
   */
  speakFrames: number;
  /** Scene-local frame where narration starts. */
  offset?: number;
  /** Trailing silence inside the clip that should not carry caption time. */
  tail?: number;
}> = ({ text, speakFrames, offset = 0, tail = 0 }) => {
  const frame = useCurrentFrame();
  const chunks = React.useMemo(() => chunkLine(text), [text]);
  const total = Math.max(1, chunks.reduce((a, c) => a + c.length, 0));
  const speak = Math.max(1, speakFrames - offset - tail);

  let acc = 0;
  let idx = -1;
  let localStart = 0;
  let localLen = 0;
  for (let i = 0; i < chunks.length; i++) {
    const len = (chunks[i].length / total) * speak;
    if (frame >= offset + acc && frame < offset + acc + len) {
      idx = i;
      localStart = offset + acc;
      localLen = len;
      break;
    }
    acc += len;
  }
  if (idx === -1) return null;

  const inChunk = frame - localStart;
  const o = Math.min(
    interpolate(inChunk, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
    interpolate(localLen - inChunk, [0, 5], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
  );

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 44, pointerEvents: "none" }}>
      <div
        style={{
          opacity: o,
          transform: `translateY(${interpolate(o, [0, 1], [10, 0])}px)`,
          maxWidth: 1360,
          textAlign: "center",
          background: "rgba(8,9,15,0.62)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14,
          padding: "14px 30px",
          backdropFilter: "blur(6px)",
        }}
      >
        <span
          style={{
            fontFamily: "'Space Grotesk', system-ui, sans-serif",
            fontSize: 30,
            fontWeight: 500,
            color: "rgba(240,240,250,0.97)",
            lineHeight: 1.35,
            letterSpacing: "-0.005em",
          }}
        >
          {chunks[idx]}
        </span>
      </div>
    </AbsoluteFill>
  );
};

export const staticPath = staticFile;
