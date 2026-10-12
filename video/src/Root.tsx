import { Composition } from "remotion";
import { Demo, FPS, WIDTH, HEIGHT } from "./Demo";

export const RemotionRoot: React.FC = () => (
  <Composition
    id="SubscriptionsDemo"
    component={Demo}
    durationInFrames={92 * FPS}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
  />
);
