/*
 * Deterministic bucket selection for record slugs.
 *
 * FNV-1a alone is not enough here. Its avalanche is weak in the low bits for
 * short inputs, and `% buckets` reads exactly those bits, so a set of similar
 * slugs collapses onto a few buckets: of seven real project slugs, five landed
 * on the same one. The xorshift finalizer folds the well-mixed high bits down
 * before the modulo, which spreads them properly.
 *
 * Nothing here is security relevant; this only needs to be stable and evenly
 * spread, so that a record keeps the same glyph and scene across builds.
 */
export function stableIndex(seed: string, buckets: number): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  // `^=` yields a signed 32-bit result, which would make the modulo negative.
  hash = (hash ^ (hash >>> 16)) >>> 0;

  return hash % buckets;
}
