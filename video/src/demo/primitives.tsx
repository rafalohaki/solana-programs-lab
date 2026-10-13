// Demo-video-only primitives. Read-only imports from ../kit keep the motion
// language identical to the pitch composition.
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { C, GROTESK, MONO, easeIO, useEnter } from "../kit";
import { SCENES, TOTAL_FRAMES, type SceneTiming } from "./timeline.generated";

// ---------------------------------------------------------------- surfaces ---

export const Panel: React.FC<{
  children: React.ReactNode;
  style?: React.CSSProperties;
  accent?: string;
  pad?: number;
}> = ({ children, style, accent = "rgba(255,255,255,0.10)", pad = 30 }) => (
  <div
    style={{
      background: "rgba(25,27,37,0.72)",
      border: `1px solid ${accent}`,
      borderRadius: 18,
      padding: pad,
      backdropFilter: "blur(6px)",
      ...style,
    }}
  >
    {children}
  </div>
);

export const Mono: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  tracking?: string;
  caps?: boolean;
}> = ({ children, size = 20, color = C.dim, style, tracking = "0.06em", caps = false }) => (
  <span
    style={{
      fontFamily: MONO,
      fontSize: size,
      color,
      letterSpacing: tracking,
      textTransform: caps ? "uppercase" : "none",
      lineHeight: 1.45,
      ...style,
    }}
  >
    {children}
  </span>
);

// ------------------------------------------------------------------ motion ---

/** Word-by-word reveal, same spring language as kit's KineticLine but alignable. */
export const RiseWords: React.FC<{
  text: string;
  size?: number;
  color?: string;
  weight?: number;
  delay?: number;
  stagger?: number;
  align?: "left" | "center";
  lineHeight?: number;
}> = ({ text, size = 72, color = C.ink, weight = 700, delay = 0, stagger = 2.4, align = "left", lineHeight = 1.08 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0 0.30em",
        justifyContent: align === "center" ? "center" : "flex-start",
        textAlign: align,
      }}
    >
      {text.split(" ").map((w, i) => {
        const s = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 220, mass: 0.9 } });
        return (
          <span
            key={i}
            style={{
              fontFamily: GROTESK,
              fontSize: size,
              fontWeight: weight,
              color,
              letterSpacing: "-0.025em",
              lineHeight,
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [size * 0.42, 0])}px)`,
              whiteSpace: "pre",
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Section header: mono eyebrow + big title, sharing one entrance curve. */
export const Head: React.FC<{
  eyebrow: string;
  title: string;
  accent?: string;
  size?: number;
  delay?: number;
  align?: "left" | "center";
}> = ({ eyebrow, title, accent = C.mint, size = 68, delay = 0, align = "left" }) => {
  const e = useEnter(delay, 110);
  return (
    <div style={{ textAlign: align }}>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 21,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: accent,
          opacity: e.opacity,
          transform: `translateY(${e.y * 0.6}px)`,
        }}
      >
        {eyebrow}
      </div>
      <div style={{ marginTop: 16 }}>
        <RiseWords text={title} size={size} delay={delay + 3} align={align} />
      </div>
    </div>
  );
};

/** Soft presence: fades in and out so nothing ever cuts hard to black. */
export const Faded: React.FC<{ duration: number; children: React.ReactNode; in_?: number; out?: number }> = ({
  duration,
  children,
  in_ = 8,
  out = 8,
}) => {
  const frame = useCurrentFrame();
  const a = interpolate(frame, [0, in_], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const b = interpolate(duration - frame, [0, out], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
};

// ------------------------------------------------------------- live product ---

const CHROME_H = 54;
// ---------------------------------------------------------------- footage src ---
// THE ONE PLACE the capture directory is chosen. Swap this single string to move
// between footage generations; the content-box aspect below follows it, so the
// capture is never stretched or letterboxed.
//   "live-mp4"  -> 1600x900 (16:9)  post-rename clean capture
//   "live-crop" -> 1600x808 (1.98:1) nav-band-cropped fallback
const FOOTAGE_DIR = "live-mp4";
const FOOTAGE_DIMS: Record<string, { w: number; h: number }> = {
  "live-mp4": { w: 1600, h: 900 },
  "live-crop": { w: 1600, h: 808 },
};
const SRC = FOOTAGE_DIMS[FOOTAGE_DIR];
if (!SRC) throw new Error(`unknown FOOTAGE_DIR: ${FOOTAGE_DIR}`);

// Keep the verified vertical budget (FRAME_H 853 -> caption at 947, rail at 1010)
// and derive the width from the true source aspect.
const CONTENT_H = 799;
const FRAME_W = Math.round((CONTENT_H * SRC.w) / SRC.h); // mp4 -> 1420, crop -> 1582
const FRAME_H = CHROME_H + CONTENT_H; // 853, unchanged
// Vertical budget: heading (top 14, h=44) + frame + caption + rail (top 1010).
export const FRAME_LEFT = (1920 - FRAME_W) / 2;
export { FRAME_W };
export const LIVE_TOP = 74;
const CAPTION_TOP = LIVE_TOP + FRAME_H + 20; // 74 + 853 + 20 = 947
export const RAIL_TOP = 1010;
/** Scenes must keep their content above this line; the rail owns everything below. */
export const CONTENT_BOTTOM = 996;

const PATHS: Record<string, string> = {
  plans: "/",
  proofs: "/proofs",
  checkout: "/pay",
  merchant: "/merchant",
  manage: "/manage",
  agent: "/agent",
  blink: "/blink",
  examples: "/examples",
};

/** Browser chrome around the real captured product. */
export const LiveFrame: React.FC<{ timing: SceneTiming }> = ({ timing }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dur = timing.durationInFrames;
  const clipFrames = timing.clipFrames ?? 300;

  // Never speed the capture up: it is already a smooth scroll. Only slow it down
  // when the scene is longer than the clip.
  const rate = Math.min(1, clipFrames / dur);
  const enter = spring({ frame, fps, config: { damping: 220, mass: 0.9 } });
  const push = interpolate(easeIO(Math.min(frame / dur, 1)), [0, 1], [1.0, 1.045]);
  const drift = interpolate(frame, [0, dur], [-6, 6]);

  return (
    <div
      style={{
        position: "absolute",
        left: FRAME_LEFT,
        top: LIVE_TOP,
        width: FRAME_W,
        height: FRAME_H,
        borderRadius: 20,
        overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.16)",
        background: C.abyss,
        boxShadow: "0 50px 150px rgba(0,0,0,0.7), 0 0 110px rgba(153,69,255,0.15)",
        opacity: enter,
        transform: `scale(${interpolate(enter, [0, 1], [1.035, 1])})`,
      }}
    >
      <div
        style={{
          height: CHROME_H,
          background: "#1a1c26",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "0 20px",
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((cc) => (
          <div key={cc} style={{ width: 13, height: 13, borderRadius: 99, background: cc, opacity: 0.85 }} />
        ))}
        <div
          style={{
            marginLeft: 14,
            width: 620,
            background: "rgba(255,255,255,0.06)",
            borderRadius: 8,
            padding: "7px 14px",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span style={{ fontFamily: MONO, fontSize: 15, color: "#8ce99a" }}>●</span>
          <Mono size={16} color={C.faint} tracking="0.02em">
            solhack.rafal.si{PATHS[timing.clip ?? "plans"] ?? "/"}
          </Mono>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 99, background: C.mint, boxShadow: `0 0 12px ${C.mint}` }} />
          <Mono size={15} color={C.dim} tracking="0.14em" caps>
            devnet
          </Mono>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: CONTENT_H, overflow: "hidden", background: "#0b0d14" }}>
        <OffthreadVideo
          src={staticFile(`${FOOTAGE_DIR}/${timing.clip}.mp4`)}
          muted
          playbackRate={rate}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: FRAME_W,
            height: CONTENT_H,
            transformOrigin: "50% 42%",
            transform: `scale(${push}) translateY(${drift}px)`,
          }}
        />
        {/* gentle vignette so captions stay readable over any UI state */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(0,0,0,0.16) 0%, transparent 22%, transparent 74%, rgba(0,0,0,0.42) 100%)",
          }}
        />
      </div>
    </div>
  );
};

/** Caption + chapter marker that sits under the live frame. */
export const LiveLowerThird: React.FC<{ timing: SceneTiming; index: number; count: number }> = ({
  timing,
  index,
  count,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const e = spring({ frame: frame - fps * 0.25, fps, config: { damping: 220 } });
  const y = CAPTION_TOP;

  return (
    <div
      style={{
        position: "absolute",
        left: FRAME_LEFT,
        top: y,
        width: FRAME_W,
        display: "flex",
        alignItems: "center",
        gap: 18,
        opacity: e,
        transform: `translateY(${interpolate(e, [0, 1], [16, 0])}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 9, height: 9, borderRadius: 99, background: C.mint, boxShadow: `0 0 16px ${C.mint}` }} />
        <Mono size={19} color={C.mint} tracking="0.2em" caps>
          live
        </Mono>
      </div>
      <Mono size={23} color={C.ink} tracking="0.03em" style={{ flex: 1 }}>
        {timing.caption}
      </Mono>
      <Mono size={19} color={C.faint} tracking="0.14em">
        {String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}
      </Mono>
    </div>
  );
};

// ------------------------------------------------------------- chapter rail ---

/** Persistent bottom rail: overall progress + one tick per scene. */
export const ChapterRail: React.FC = () => {
  const frame = useCurrentFrame();
  const W = 1700;
  const left = (1920 - W) / 2;
  const top = RAIL_TOP;
  let active = 0;
  for (let i = 0; i < SCENES.length; i++) if (frame >= SCENES[i].startFrame) active = i;

  return (
    <div style={{ position: "absolute", left, top, width: W }}>
      <div style={{ display: "flex", gap: 5, height: 4 }}>
        {SCENES.map((s, i) => {
          const local = (frame - s.startFrame) / s.durationInFrames;
          const fill = i < active ? 1 : i > active ? 0 : Math.max(0, Math.min(1, local));
          return (
            <div
              key={s.id}
              style={{
                flex: s.durationInFrames,
                height: 4,
                borderRadius: 2,
                background: "rgba(225,225,240,0.12)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${fill * 100}%`,
                  height: "100%",
                  background: i === active ? C.mint : "rgba(20,241,195,0.45)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        <Mono size={16} color={C.faint} tracking="0.18em" caps>
          Iugis · live product demo · solana devnet
        </Mono>
        <Mono size={16} color={C.faint} tracking="0.18em">
          {String(Math.floor(frame / 30 / 60)).padStart(1, "0")}:
          {String(Math.floor((frame / 30) % 60)).padStart(2, "0")} / {Math.floor(TOTAL_FRAMES / 30 / 60)}:
          {String(Math.floor((TOTAL_FRAMES / 30) % 60)).padStart(2, "0")}
        </Mono>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------- atoms ---

export const StatCard: React.FC<{
  value: string;
  label: string;
  sub?: string;
  color: string;
  delay: number;
}> = ({ value, label, sub, color, delay }) => {
  const e = useEnter(delay, 110);
  return (
    <Panel
      style={{
        opacity: e.opacity,
        transform: `translateY(${e.y}px)`,
        borderColor: `${color}55`,
        boxShadow: `0 0 60px ${color}18`,
        flex: 1,
      }}
      pad={34}
    >
      <div style={{ fontFamily: GROTESK, fontSize: 86, fontWeight: 700, color, letterSpacing: "-0.03em", lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ marginTop: 16 }}>
        <Mono size={21} color={C.ink} tracking="0.1em" caps>
          {label}
        </Mono>
      </div>
      {sub ? (
        <div style={{ marginTop: 10 }}>
          <Mono size={18} color={C.faint} tracking="0.04em">
            {sub}
          </Mono>
        </div>
      ) : null}
    </Panel>
  );
};

export const Pill: React.FC<{ text: string; color: string; delay?: number }> = ({ text, color, delay = 0 }) => {
  const e = useEnter(delay, 120);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        border: `1px solid ${color}66`,
        background: `${color}14`,
        borderRadius: 999,
        padding: "9px 20px",
        opacity: e.opacity,
        transform: `translateY(${e.y * 0.5}px)`,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 99, background: color }} />
      <Mono size={18} color={color} tracking="0.16em" caps>
        {text}
      </Mono>
    </div>
  );
};
