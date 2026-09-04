/*
 * How a paragraph of project prose is named in the content catalog.
 *
 * A summary is one frontmatter field and can be keyed by hand. A body is
 * markdown, and by the time it is HTML there is nothing left to hang a key on,
 * so the key is derived from the paragraph itself and resolved in the browser
 * at the moment the layer is opened. Nothing is stamped into the build: a
 * reader who never finds the switch downloads no evidence that it exists,
 * which is the same rule the catalog itself follows.
 *
 * Keys hash the text rather than counting position. Position would be the
 * obvious choice and the wrong one: inserting a sentence halfway down a record
 * would shift every key below it, and the layer would confidently show the
 * wrong translation under each paragraph. Hashing means an edited paragraph
 * stops matching, quietly falls back to English, and is reported by the test
 * that checks the catalog against the records.
 *
 * .mjs because this is the single definition of the scheme and it is read from
 * three places with three different loaders: the client script that resolves
 * keys, the test suite, and any tooling that needs to list them.
 */

/*
 * FNV-1a with the same xorshift finalizer as stableIndex in ./hash.ts, for the
 * same reason: short, similar inputs otherwise differ only in the low bits.
 * Rendered as hex rather than reduced modulo a bucket count, because this has
 * to identify a paragraph rather than choose one of a handful of scenes.
 */
export function stableTag(seed) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d) >>> 0;
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b) >>> 0;
  hash = (hash ^ (hash >>> 16)) >>> 0;

  return hash.toString(16).padStart(8, "0");
}

/*
 * Rewrapping a paragraph in the source must not retire its translation, and
 * the browser collapses whitespace before a reader ever sees it, so identity
 * is defined on the collapsed text.
 */
export function normaliseProse(text) {
  return text.replace(/\s+/g, " ").trim();
}

/** The catalog key for one paragraph of a project's body. */
export function projectBodyKey(id, text) {
  return `project.${id}.body.${stableTag(normaliseProse(text))}`;
}
