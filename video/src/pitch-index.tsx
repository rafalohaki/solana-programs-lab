// Second Remotion entry point: the OnchainSUB pitch video (<=2 min).
// Kept separate from src/index.ts so the demo composition stays untouched.
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { Composition, registerRoot } from "remotion";
import { HEIGHT, WIDTH } from "./kit";
import { PITCH_DURATION, PITCH_FPS, Pitch } from "./pitch/Pitch";

loadGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

export const PitchRoot: React.FC = () => (
  <Composition
    id="OnchainSUBPitch"
    component={Pitch}
    durationInFrames={PITCH_DURATION}
    fps={PITCH_FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);

registerRoot(PitchRoot);
