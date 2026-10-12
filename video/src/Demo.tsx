import React from "react";
import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from "remotion";
import { Bg, C } from "./kit";
import {
  SceneColdOpen,
  SceneProblem,
  SceneSolution,
  SceneTeam,
  SceneTech,
  SceneTour,
  SceneTour2,
  SceneTour3,
  SceneTour4,
  SceneOutro,
} from "./scenes";

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

/** Crossfade wrapper. Inside <Sequence> useCurrentFrame() is already
 * sequence-local — never subtract the offset again. */
const Faded: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const fadeOut = interpolate(duration - frame, [0, 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: Math.min(fadeIn, fadeOut) }}>
      <AbsoluteFill style={{ background: C.void }} />
      {children}
    </AbsoluteFill>
  );
};

// Total 92s. Intro squeezes cold open + problem + solution into 0-19s so the
// product demo starts at 0:19 (<=20s goal). TEAM beat runs 15s right before outro.
const SCENES: { from: number; duration: number; component: React.FC }[] = [
  { from: 0, duration: 5 * 30, component: SceneColdOpen },
  { from: 5 * 30, duration: 6 * 30, component: SceneProblem },
  { from: 11 * 30, duration: 8 * 30, component: SceneSolution },
  { from: 19 * 30, duration: 11 * 30, component: SceneTour },
  { from: 30 * 30, duration: 10 * 30, component: SceneTour2 },
  { from: 40 * 30, duration: 10 * 30, component: SceneTour3 },
  { from: 50 * 30, duration: 9 * 30, component: SceneTour4 },
  { from: 59 * 30, duration: 10 * 30, component: SceneTech },
  { from: 69 * 30, duration: 15 * 30, component: SceneTeam },
  { from: 84 * 30, duration: 8 * 30, component: SceneOutro },
];

export const Demo: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: C.void }}>
      {/* persistent ambient layer so cuts never flash black */}
      <Bg intensity={0.6} />
      {SCENES.map(({ from, duration, component: Component }, i) => (
        <Sequence key={i} from={from} durationInFrames={duration + 10}>
          <Faded duration={duration}>
            <Component />
          </Faded>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
