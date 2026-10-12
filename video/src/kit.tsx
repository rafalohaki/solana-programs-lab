// Shared design tokens + reusable motion primitives for the demo video.
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const C = {
  void: "#11131d",
  abyss: "#0c0e17",
  panel: "#191b25",
  ink: "#e1e1f0",
  dim: "rgba(225,225,240,0.55)",
  faint: "rgba(225,225,240,0.32)",
  purple: "#9945FF",
  mint: "#14F195",
  cyan: "#00dbe9",
  coral: "#ff3b69",
  tint: "#d8b9ff",
};

export const GROTESK = "'Space Grotesk', system-ui, sans-serif";
export const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Smooth in-out easing for camera moves. */
export const easeIO = (t: number): number =>
  interpolate(t, [0, 1], [0, 1], { easing: (x) => x * x * (3 - 2 * x) });

// --- Animated background: drifting gradient blobs + fine grid ---------------

export const Bg: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = frame / durationInFrames;
  const drift = (phase: number, amp: number) => Math.sin(p * Math.PI * 2 + phase) * amp;
  return (
    <AbsoluteFill style={{ background: C.void }}>
      <div
        style={{
          position: "absolute",
          width: 1400,
          height: 1400,
          left: interpolate(p, [0, 1], [-200, 300]) + drift(0, 60),
          top: -500 + drift(1, 40),
          background: `radial-gradient(circle, rgba(153,69,255,${0.16 * intensity}), transparent 65%)`,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1200,
          height: 1200,
          right: interpolate(p, [0, 1], [-150, 250]) + drift(2, 50),
          bottom: -450 + drift(3, 40),
          background: `radial-gradient(circle, rgba(20,241,195,${0.12 * intensity}), transparent 65%)`,
          filter: "blur(60px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
    </AbsoluteFill>
  );
};

// --- Entrance helpers ---------------------------------------------------------

export const useEnter = (delayFrames: number, stiffness = 120): { opacity: number; y: number; scale: number } => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delayFrames, fps, config: { damping: 220, mass: 0.9, stiffness } });
  return {
    opacity: s,
    y: interpolate(s, [0, 1], [34, 0]),
    scale: interpolate(s, [0, 1], [0.97, 1]),
  };
};

/** Word-by-word kinetic reveal. */
export const KineticLine: React.FC<{
  text: string;
  size?: number;
  color?: string;
  weight?: number;
  delay?: number;
  mono?: boolean;
}> = ({ text, size = 96, color = C.ink, weight = 700, delay = 0, mono = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(" ");
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.32em", justifyContent: "center" }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - delay - i * 3, fps, config: { damping: 220 } });
        return (
          <span
            key={i}
            style={{
              fontFamily: mono ? MONO : GROTESK,
              fontSize: size,
              fontWeight: weight,
              color,
              letterSpacing: mono ? "0.02em" : "-0.02em",
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [size * 0.5, 0])}px)`,
              whiteSpace: "pre",
            }}
          >
            {w}
            {i < words.length - 1 ? " " : ""}
          </span>
        );
      })}
    </div>
  );
};

/** Mono eyebrow label. */
export const Eyebrow: React.FC<{ text: string; color?: string; delay?: number }> = ({ text, color = C.mint, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 220 } });
  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize: 22,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color,
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [18, 0])}px)`,
      }}
    >
      {text}
    </div>
  );
};

// --- Ticking number ------------------------------------------------------------

export const Ticker: React.FC<{
  from: number;
  to: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  size?: number;
  color?: string;
  start?: number;
  durationFrames?: number;
}> = ({ from, to, decimals = 0, prefix = "", suffix = "", size = 110, color = C.ink, start = 0, durationFrames = 45 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + durationFrames], [from, to], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <span style={{ fontFamily: GROTESK, fontSize: size, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
      {prefix}
      {t.toFixed(decimals)}
      {suffix}
    </span>
  );
};

// --- Browser frame with a screenshot, camera pan/zoom --------------------------

export interface ShotSpec {
  src: string;
  /** Zoom level at the start / end of the shot (1 = fit width). */
  zoomStart?: number;
  zoomEnd?: number;
  /** Normalised focal point (0..1 of the image box) the camera holds. */
  focus?: { x: number; y: number };
  caption: string;
  duration: number;
}

export const BrowserFrame: React.FC<{ spec: ShotSpec }> = ({ spec }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = easeIO(Math.min(frame / (spec.duration * 0.85), 1));
  const in_ = spring({ frame, fps, config: { damping: 220 } });

  const frameW = 1480;
  const frameH = 800;
  const zoom = interpolate(easeIO(Math.min(frame / spec.duration, 1)), [0, 1], [spec.zoomStart ?? 1.9, spec.zoomEnd ?? 1.15]);
  const fx = (spec.focus?.x ?? 0.5) * 100;
  const fy = (spec.focus?.y ?? 0.35) * 100;

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: in_ }}>
      <div
        style={{
          width: frameW,
          height: frameH,
          borderRadius: 20,
          overflow: "hidden",
          border: `1px solid rgba(255,255,255,0.14)`,
          boxShadow: `0 60px 160px rgba(0,0,0,0.65), 0 0 120px rgba(153,69,255,${0.16 * (1 - t)})`,
          background: C.abyss,
          transform: `scale(${interpolate(in_, [0, 1], [1.05, 1])})`,
        }}
      >
        {/* browser chrome */}
        <div
          style={{
            height: 52,
            background: "#1a1c26",
            display: "flex",
            alignItems: "center",
            paddingHorizontal: 18,
            padding: "0 18px",
            gap: 10,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {["#ff5f57", "#febc2e", "#28c840"].map((cc) => (
            <div key={cc} style={{ width: 14, height: 14, borderRadius: 99, background: cc, opacity: 0.85 }} />
          ))}
          <div
            style={{
              marginLeft: 16,
              flex: 1,
              maxWidth: 560,
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "6px 14px",
              fontFamily: MONO,
              fontSize: 16,
              color: C.faint,
            }}
          >
            solhack.rafal.si
          </div>
        </div>
        {/* content with camera */}
        <div style={{ position: "relative", width: "100%", height: frameH - 52, overflow: "hidden" }}>
          <Img
            src={staticFile(spec.src)}
            style={{
              position: "absolute",
              // Fit the frame width (was: composition width, which cropped
              // ~220px per side even at zoom 1 and cut form labels).
              // Zoom levels in specs magnify from this fit baseline.
              width: frameW,
              left: 0,
              top: 0,
              transformOrigin: `${fx}% ${fy}%`,
              transform: `scale(${zoom}) translate(${interpolate(frame, [0, spec.duration], [-14, 14])}px, 0)`,
            }}
          />
        </div>
      </div>
      {/* lower third */}
      <div
        style={{
          position: "absolute",
          bottom: 56,
          display: "flex",
          alignItems: "center",
          gap: 18,
          opacity: interpolate(frame, [fps * 0.4, fps * 0.9], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
        }}
      >
        <div style={{ width: 10, height: 10, borderRadius: 99, background: C.mint, boxShadow: `0 0 18px ${C.mint}` }} />
        <span style={{ fontFamily: MONO, fontSize: 24, letterSpacing: "0.2em", textTransform: "uppercase", color: C.ink }}>
          {spec.caption}
        </span>
      </div>
    </AbsoluteFill>
  );
};
