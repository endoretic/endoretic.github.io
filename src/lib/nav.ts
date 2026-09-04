/*
 * Which links the client router is allowed to handle.
 *
 * endoretic.cc is not only this site. Two projects publish their own GitHub
 * Pages sites from their own repositories, and they are served under this
 * origin at /pjsk-tier-maker/ and /score-calculator/. A demo link can therefore
 * be same-origin and still lead somewhere this document knows nothing about.
 *
 * The router intercepts same-origin links by default, so left alone it would
 * fetch another site's HTML and swap it into this page's shell: the reader
 * would land on something that is neither site. `data-astro-reload` opts a link
 * back out into an ordinary navigation.
 *
 * The test is deliberately inverted from the obvious one. Rather than listing
 * the destinations to exclude, which would silently rot the next time a project
 * is published at a new subpath, a link is handed to the router only when it
 * matches a route this site actually builds, and anything unrecognised is made
 * a full navigation. Guessing wrong in that direction costs one ordinary page
 * load; guessing wrong in the other breaks the destination.
 */

import { SITE } from "../data/site";

/* Every route pattern src/pages/ produces, with trailingSlash: "always". */
const ROUTES: readonly RegExp[] = [
  /^\/$/,
  /^\/about\/$/,
  /^\/credits\/$/,
  /^\/works\/(?:[^/]+\/)?$/,
  /^\/notes\/(?:[^/]+\/)?$/,
];

/** Whether an href resolves to a page this site builds and can swap in. */
export function isSiteRoute(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href, SITE.url);
  } catch {
    /* Not a resolvable URL — a mailto:, a bare fragment, something malformed. */
    return false;
  }

  if (url.origin !== new URL(SITE.url).origin) return false;

  return ROUTES.some((route) => route.test(url.pathname));
}

/**
 * Attributes for a link whose destination comes from content rather than from
 * the route table: a repository, a demo, anything an entry can point at. Spread
 * it onto the anchor.
 */
export function outboundLink(href: string): { "data-astro-reload"?: boolean } {
  return isSiteRoute(href) ? {} : { "data-astro-reload": true };
}
