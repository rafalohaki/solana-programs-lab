import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { Bg, C, GROTESK, MONO } from "../kit";
import { Faded, FRAME_LEFT, FRAME_W, LiveFrame, LiveLowerThird, Mono } from "./primitives";
import type { SceneTiming } from "./timeline.generated";

/** Section opener for the live tour: makes the handoff from mechanism explicit. */
export const TourIntro: React.FC = () => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
    <Bg intensity={1.0} />
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: 22, letterSpacing: "0.24em", textTransform: "uppercase", color: C.mint }}>
        part two · the live product
      </div>
      <div style={{ marginTop: 26 }}>
        <span style={{ fontFamily: GROTESK, fontSize: 92, fontWeight: 700, color: C.ink, letterSpacing: "-0.035em" }}>
          Everything from here is live.
        </span>
      </div>
      <div style={{ marginTop: 30 }}>
        <Mono size={24} color={C.dim} tracking="0.08em">
          solhack.rafal.si · Solana devnet · captured from the running deployment
        </Mono>
      </div>
    </div>
  </AbsoluteFill>
);

/**
 * One chapter of the live product tour. Eight of these run back to back; each
 * one is a real capture of the deployed site inside browser chrome, with a
 * caption naming what is on screen.
 */
export const TourChapter: React.FC<{ timing: SceneTiming; index: number; count: number }> = ({
  timing,
  index,
  count,
}) => {
  const frame = useCurrentFrame();
  const title = interpolate(frame, [0, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Bg intensity={0.62} />
      {/* chapter heading, top-left, aligned to the frame edge */}
      <div
        style={{
          position: "absolute",
          left: FRAME_LEFT,
          top: 14,
          width: FRAME_W,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          opacity: title,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
          <span style={{ fontFamily: GROTESK, fontSize: 34, fontWeight: 700, color: C.ink, letterSpacing: "-0.02em" }}>
            The live product
          </span>
          <Mono size={19} color={C.faint} tracking="0.16em" caps>
            {timing.eyebrow}
          </Mono>
        </div>
      </div>
      <LiveFrame timing={timing} />
      <LiveLowerThird timing={timing} index={index} count={count} />
    </AbsoluteFill>
  );
};

export { Faded };
