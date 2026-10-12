// Entry point for the static brand assets used in the Colosseum submission.
//
// Separate Remotion entry (not part of the pitch/demo compositions) so these
// stills can be rendered without touching either video's timeline.
import { Composition, registerRoot } from "remotion";
import { BrandCard, LogoSquare, LogoWide } from "./pitch/brand-assets";
import "@remotion/google-fonts/SpaceGrotesk";
import "@remotion/google-fonts/JetBrainsMono";

const FPS = 30;
const W = 1920;
const H = 1080;

const Root: React.FC = () => (
  <>
    <Composition id="LogoSquare" component={LogoSquare} durationInFrames={1} fps={FPS} width={1080} height={1080} />
    <Composition id="LogoWide" component={LogoWide} durationInFrames={1} fps={FPS} width={1600} height={900} />
    <Composition id="BrandCard" component={BrandCard} durationInFrames={1} fps={FPS} width={W} height={H} />
  </>
);

registerRoot(Root);
