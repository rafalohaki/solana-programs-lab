import { Composition } from "remotion";
import { FPS, HEIGHT, WIDTH } from "./kit";
import { DemoComposition } from "./demo/DemoComposition";
import { TOTAL_FRAMES } from "./demo/timeline.generated";

/**
 * Second entry point, owned by the demo builder. The pitch composition lives in
 * ./index.tsx and is untouched by this file.
 */
export const DemoRoot: React.FC = () => (
  <Composition
    id="IugisDemo"
    component={DemoComposition}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
