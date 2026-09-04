import type { APIRoute } from "astro";

import { CATALOGS, CONTENT_CATALOG, LAYER_LOCALE } from "../../lib/i18n";

/*
 * The Hymmnos catalog is served as a separate static file rather than inlined
 * into every page. The layer is hidden, so most visits must not pay for it:
 * nothing here is requested until a reader opens the switch.
 *
 * Only the Hymmnos strings are published. Restoring English needs no payload —
 * the script keeps each element's rendered text before replacing it, which is
 * both smaller and exact.
 *
 * Interface and content strings ship together. They are two catalogs in the
 * repository because they have two different sources of English, but to a
 * reader opening the switch they are one language, and splitting them here
 * would only buy a second request at the exact moment the layer is revealed.
 */
export const prerender = true;

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ ...CATALOGS[LAYER_LOCALE], ...CONTENT_CATALOG }), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
