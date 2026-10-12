import React from "react";
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Bg, C } from "../kit";
import { ChapterRail, Faded } from "./primitives";
import { ColdOpen, Problem } from "./scenesOpen";
import { Mechanism } from "./scenesMechanism";
import { TourChapter, TourIntro } from "./scenesTour";
import { Proof, Close } from "./scenesProof";
import { byId, SCENES, TOTAL_FRAMES } from "./timeline.generated";

const TOUR_IDS = [
  "04_tour_plans",
  "05_tour_proofs",
  "06_tour_checkout",
  "07_tour_merchant",
  "08_tour_manage",
  "09_tour_agent",
  "10_tour_blink",
  "11_tour_widget",
];

/** Scene id -> component. Tour chapters are built from the generated timings. */
const renderScene = (id: string, index: number, count: number): React.ReactNode => {
  switch (id) {
    case "01_cold_open":
      return <ColdOpen />;
    case "02_problem":
      return <Problem />;
    case "03_mechanism":
      return <Mechanism />;
    case "12_proof":
      return <Proof />;
    case "13_close":
      return <Close />;
    default:
      return <TourChapter timing={byId(id)} index={index} count={count} />;
  }
};

/**
 * The demo slideshow. Every scene is a <Sequence> so useCurrentFrame() inside is
 * scene-local; Faded keeps a 6-frame crossfade so the cut never lands on black.
 */
export const DemoComposition: React.FC = () => {
  const frame = useCurrentFrame();
  // Opening fade from black only; after that the ambient layer is always on.
  const openFade = interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  let tourNo = 0;

  return (
    <AbsoluteFill style={{ background: C.void }}>
      <AbsoluteFill style={{ opacity: openFade }}>
        {/* persistent ambient layer: nothing ever cuts to pure black */}
        <Bg intensity={0.5} />

        {SCENES.map((s) => {
          const isTour = TOUR_IDS.includes(s.id);
          if (isTour) tourNo += 1;
          return (
            <Sequence key={s.id} from={s.startFrame} durationInFrames={s.durationInFrames + 8} name={s.id}>
              <Faded duration={s.durationInFrames} in_={s.id === "01_cold_open" ? 14 : 7} out={s.id === "13_close" ? 30 : 7}>
                {renderScene(s.id, tourNo - 1, TOUR_IDS.length)}
              </Faded>
            </Sequence>
          );
        })}

        {/* Part-two title card, over the seam between mechanism and the tour. */}
        <Sequence from={byId("04_tour_plans").startFrame - 74} durationInFrames={86} name="tour-intro">
          <Faded duration={86} in_={12} out={14}>
            <TourIntro />
          </Faded>
        </Sequence>

        <ChapterRail />
      </AbsoluteFill>

      {/* ---- audio: narration + ducked bed. Both are full-length single files. */}
      <Audio src={staticFile("audio/demo/narration.wav")} volume={1} />
      <Audio src={staticFile("audio/demo/music.wav")} volume={0.55} />
    </AbsoluteFill>
  );
};

export { TOTAL_FRAMES };
