// Demo entry point (second Remotion root). JSX requires this file to be .tsx.
// Fonts load with built-in delayRender — Remotion waits for them before rendering.
import { loadFont as loadGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { registerRoot } from "remotion";
import { DemoRoot } from "./DemoRoot";

loadGrotesk("normal", { weights: ["500", "700"], subsets: ["latin"] });
loadMono("normal", { weights: ["400", "500"], subsets: ["latin"] });

registerRoot(DemoRoot);
