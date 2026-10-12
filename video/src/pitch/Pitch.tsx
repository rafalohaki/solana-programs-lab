// OnchainSUB pitch video — <=2 minutes, narration-led.
//
// Scene durations are derived from the measured narration clip lengths plus a
// deliberate beat for the closing card, so the voice never gets cut off and the
// total stays comfortably under the 120s Colosseum pitch limit.
import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { C, CaptionTrack, FPS } from "./brand";
import { OVERLAP } from "./scenes";
import {
  S1Hook,
  S2Problem,
  S3Solution,
  S4Flow,
  S5Live,
  S6Proof,
  S7Builder,
  S8Close,
} from "./scenes";

/** Narration text, mirrored from the generated clips for the burned-in captions. */
const TEXT: Record<string, string> = {
  s1: "Subscriptions on-chain usually mean one of two bad options: lock your money in escrow, or hand a contract an unlimited allowance.",
  s2: "Card rails charge about 2.9% plus 30 cents on every single charge, settle in about two days, and keep your card on file. Crypto solved the transfer, but it never solved the recurring pull.",
  s3: "OnchainSUB is a Solana program for recurring payments with zero custody. You approve a single SPL token delegate, capped at exactly one period. The program can only pull that amount once per period, and your funds stay in your wallet until charge day.",
  s4: "A merchant creates a plan on chain: a mint, an amount, and a period. A subscriber approves the subscription account as their delegate. Each period the merchant calls charge, and the program signs for exactly the plan amount. It cannot overcharge, because charge takes no amount argument at all.",
  s5: "It is live on Solana devnet today, and the whole product is running: checkout, merchant tools, wallet actions, and an embeddable checkout widget.",
  s6: "Every plan, every subscription and every charge is a public on-chain account. You can verify the program itself, and every charge it has made, on the explorer.",
  s7: "I am Rafal, a solo builder from Krakow, Poland. I wrote the on-chain program, the backend, and the frontend. This is the piece I could not find anywhere, so I built it.",
};
/** Narration lengths measured from the generated WAVs (seconds). */
const NARR = {
  s1: 8.41,
  s2: 13.18,
  s3: 16.92,
  s4: 18.56,
  s5: 8.94,
  s6: 10.35,
  s7: 11.01,
};

const at = (sec: number) => Math.round(sec * FPS);
/** Narration length plus a settle beat so the last word is never clipped. */
const scene = (sec: number, beat = 0.5) => at(sec + beat);

// Cumulative start frames.
const D1 = scene(NARR.s1, 0.35);
const D2 = scene(NARR.s2, 0.35);
const D3 = scene(NARR.s3, 0.35);
const D4 = scene(NARR.s4, 0.35);
const D5 = scene(NARR.s5 + 13.0, 0.45); // extra runway for the six-stop product tour
const D6 = scene(NARR.s6, 0.35);
const D7 = scene(NARR.s7, 0.35);
// Closing card: no narration, held long enough to read and breathe.
const D8 = at(5.0);

const START = [0, D1, D1 + D2, D1 + D2 + D3, D1 + D2 + D3 + D4, D1 + D2 + D3 + D4 + D5, D1 + D2 + D3 + D4 + D5 + D6, D1 + D2 + D3 + D4 + D5 + D6 + D7];

export const PITCH_DURATION = START[7] + D8;
export const PITCH_FPS = FPS;

/** Dissolve between scenes.
 *
 * The incoming scene is rendered after (and therefore over) the outgoing one and
 * fades in; each scene fades itself out across the shared overlap. Fading both
 * sides inside their own nominal duration would leave a near-black frame at
 * every cut.
 */
const Faded: React.FC<{ duration: number; children: React.ReactNode }> = ({ duration, children }) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ opacity: fadeIn }}>
      <AbsoluteFill style={{ background: C.void }} />
      {children}
    </AbsoluteFill>
  );
};

const SCENES: { from: number; duration: number; component: React.FC<{ dur: number }>; narr?: keyof typeof NARR }[] = [
  { from: START[0], duration: D1, component: S1Hook, narr: "s1" },
  { from: START[1], duration: D2, component: S2Problem, narr: "s2" },
  { from: START[2], duration: D3, component: S3Solution, narr: "s3" },
  { from: START[3], duration: D4, component: S4Flow, narr: "s4" },
  { from: START[4], duration: D5, component: S5Live, narr: "s5" },
  { from: START[5], duration: D6, component: S6Proof, narr: "s6" },
  { from: START[6], duration: D7, component: S7Builder, narr: "s7" },
  { from: START[7], duration: D8, component: S8Close },
];

/** Music bed that swells under the opening and closing cards. */
const Bed: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  // Duck hard while narration is running so words stay intelligible.
  const duck = interpolate(
    frame,
    [0, at(2.0), at(3.0), at(NARR.s1 + 3), at(NARR.s1 + 4)],
    [0.30, 0.30, 0.09, 0.09, 0.20],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const tail = interpolate(frame, [total - at(9), total - at(3)], [0.20, 0.34], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const vol = Math.max(duck, tail);
  return <Audio src={staticFile("audio/pitch/bed.wav")} volume={vol} />;
};

export const Pitch: React.FC = () => {
  const frame = useCurrentFrame();
  const endFade = interpolate(
    frame,
    [PITCH_DURATION - 16, PITCH_DURATION - 1],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return (
    <AbsoluteFill style={{ background: C.void }}>
      {/* Persistent ambient layer: cuts never reveal a black frame. */}
      <Bed total={PITCH_DURATION} />
      {SCENES.map(({ from, duration, component: Component, narr }, i) => (
        <Sequence key={i} from={from} durationInFrames={duration + OVERLAP}>
          <Faded duration={duration}>
            <Component dur={duration} />
            {narr ? <Audio src={staticFile(`audio/pitch/${narr}.wav`)} /> : null}
            {narr ? (
              <CaptionTrack
                text={TEXT[narr]}
                speakFrames={at(NARR[narr])}
                offset={6}
                tail={Math.round(0.35 * FPS)}
              />
            ) : null}
          </Faded>
        </Sequence>
      ))}
      {/* Fade the whole video out; the last scene never fades on its own. */}
      <AbsoluteFill style={{ background: C.void, opacity: 1 - endFade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
