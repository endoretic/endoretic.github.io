import type { SceneVariant } from "../components/SceneVignette.astro";

const SCENES: SceneVariant[] = ["relay", "console", "hall", "coast"];

/*
 * Pick a painted scene for a record from its identifier.
 *
 * The mapping is deterministic, so a project keeps the same scene across
 * builds and a reader who returns to a record finds the image they remember.
 * FNV-1a is used only to spread short, similar slugs across the set; nothing
 * here is security relevant.
 */
export function sceneForRecord(seed: string): SceneVariant {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return SCENES[hash % SCENES.length];
}
