/*
 * Module-scoped counter used to give inline SVG <defs> unique ids.
 *
 * Astro re-runs component frontmatter for every instance, so a `let` declared
 * inside a component cannot count instances. This module is evaluated once per
 * build, so the counter increments across every render and two instances of
 * the same component never emit colliding gradient ids. Ids referenced by
 * `url(#…)` are document-global, and a duplicate silently steals the other
 * element's fill.
 */
let counter = 0;

export function nextUid(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}`;
}
