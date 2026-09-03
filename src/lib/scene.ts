import type { SceneVariant } from "../components/SceneVignette.astro";
import { stableIndex } from "./hash";

const SCENES: SceneVariant[] = ["relay", "console", "hall", "coast"];

/*
 * Pick a painted scene for a record from its identifier. The mapping is
 * deterministic, so a project keeps the same scene across builds and a reader
 * returning to a record finds the image they remember.
 */
export function sceneForRecord(seed: string): SceneVariant {
  return SCENES[stableIndex(seed, SCENES.length)];
}
