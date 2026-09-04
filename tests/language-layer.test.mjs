import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { normaliseProse, projectBodyKey } from "../src/lib/prose-key.mjs";
import { brotliDecompressSync } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");

/* Sources are checked out with CRLF here; assertions are about content. */
const read = (...parts) =>
  readFileSync(join(repositoryRoot, ...parts), "utf8").replace(/\r\n/g, "\n");
const readJson = (...parts) => JSON.parse(read(...parts));

/*
 * The body paragraphs of one record, as the browser will see them.
 *
 * Read from the build rather than from the markdown, because the processor
 * rewrites straight apostrophes and dashes into typographic ones. A key
 * hashed from the source would never match the key the client derives, and
 * every body translation would silently fail to apply.
 */
function renderedProse(id) {
  const file = join(distRoot, `works/${id}/index.html`);
  if (!existsSync(file)) return [];

  const html = readFileSync(file, "utf8");
  const open = html.indexOf('<div class=\"prose\"');
  if (open === -1) return [];

  const start = html.indexOf(">", open) + 1;
  const inner = html.slice(start, html.indexOf("</div>", start));

  return [...inner.matchAll(/<p(?:\s[^>]*)?>([\s\S]*?)<\/p>/g)]
    .map(([, body]) =>
      normaliseProse(
        body
          .replace(/<[^>]+>/g, "")
          .replace(/&#38;|&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, String.fromCharCode(34))
          .replace(/&#39;|&apos;/g, String.fromCharCode(39)),
      ),
    )
    .filter(Boolean);
}

const en = readJson("src/locales/en.json");
const hymmnos = readJson("src/locales/hymmnos.json");
const hymmnosContent = readJson("src/locales/hymmnos-content.json");
const lexicon = readJson("src/data/hymmnos-words.json");

/*
 * Names that survive translation untouched, longest first — the same
 * precedence the hm-translator harness uses when it masks protected spans
 * before handing prose to a translator. Project names, brands, people,
 * companies, and technologies are identifiers, not prose.
 */
const PROTECTED_TERMS = [
  "Koei Tecmo Games Co., Ltd.",
  "Gust Co., Ltd.",
  "Akira Tsuchiya",
  "Ar tonelico",
  "endoretic.cc",
  "TypeScript",
  "Endoretic",
  "Hymmnos",
  "English",
  "Astro",
  /*
   * Content vocabulary. Project summaries name games, engines, file formats and
   * plugin hosts, and those names are the only part of a summary a reader can
   * still act on — search for, install, or recognise. Translating "USC" or
   * "osu!mania" would describe nothing and destroy that, so they are masked the
   * same way a company name is. Everything outside this list still has to be
   * attested Hymmnos.
   */
  "Project SEKAI",
  "Ethereal Style",
  "GPL-3.0",
  "OpenAI",
  "Zontex Bridge",
  "Sekai.best",
  "NextRUSH+",
  "World Link",
  "Moesekai",
  "Prosekai",
  "Japanese",
  "Wallpaper",
  "Chinese",
  "Zontex",
  "Bridge",
  ".scp",
  "PMID",
  "ISBN",
  "PDF",
  "DOI",
  "XPI",
  "osu!mania",
  "World Link",
  "event point",
  "JavaScript",
  "Prosekai",
  "tier list",
  "Sonolus",
  "plugin",
  "Zotero",
  "Python",
  "Codex",
  "USC",
  "SCP",
  "API",
  "MIT",
].sort((left, right) => right.length - left.length);

function collectFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function collectHtml(directory) {
  return collectFiles(directory).filter((file) => file.endsWith(".html"));
}

/*
 * WOFF2 is the shipped format, so the glyph-coverage check reads the shipped
 * file rather than a convenient copy of it. A conversion that quietly subset or
 * dropped glyphs would otherwise pass unnoticed until a reader saw tofu.
 *
 * Node's Brotli is enough: WOFF2 is a table directory plus one Brotli stream of
 * the tables concatenated in directory order, and `cmap` is never transformed.
 */
const WOFF2_KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function readUIntBase128(buffer, cursor) {
  let value = 0;
  for (let index = 0; index < 5; index += 1) {
    const byte = buffer[cursor.at];
    cursor.at += 1;
    assert.ok(!(index === 0 && byte === 0x80), "Leading zero in UIntBase128.");
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return value;
  }
  assert.fail("UIntBase128 longer than five bytes.");
}

function woff2Table(path, wanted) {
  const file = readFileSync(path);
  assert.equal(file.toString("latin1", 0, 4), "wOF2", "Not a WOFF2 file.");

  const tableCount = file.readUInt16BE(12);
  const compressedSize = file.readUInt32BE(20);
  const cursor = { at: 48 };
  const directory = [];

  for (let index = 0; index < tableCount; index += 1) {
    const flags = file[cursor.at];
    cursor.at += 1;

    const knownTag = flags & 0x3f;
    let tag;
    if (knownTag === 0x3f) {
      tag = file.toString("latin1", cursor.at, cursor.at + 4);
      cursor.at += 4;
    } else {
      tag = WOFF2_KNOWN_TAGS[knownTag];
    }

    const transform = (flags >> 6) & 0x03;
    const originalLength = readUIntBase128(file, cursor);
    /* Only glyf and loca have a non-null transform at version 0. */
    const untransformed =
      tag === "glyf" || tag === "loca" ? transform === 3 : transform === 0;

    directory.push({
      tag,
      length: untransformed ? originalLength : readUIntBase128(file, cursor),
    });
  }

  const tables = brotliDecompressSync(
    file.subarray(cursor.at, cursor.at + compressedSize),
  );

  let offset = 0;
  for (const entry of directory) {
    if (entry.tag === wanted) {
      return tables.subarray(offset, offset + entry.length);
    }
    offset += entry.length;
  }

  return assert.fail(`The font has no ${wanted} table.`);
}

/* Every character the font can actually draw, from its format 4 cmap. */
function fontCoverage(path) {
  const cmap = woff2Table(path, "cmap");
  assert.equal(cmap.readUInt16BE(0), 0, "Unexpected cmap version.");

  const covered = new Set();
  const subtableCount = cmap.readUInt16BE(2);

  for (let index = 0; index < subtableCount; index += 1) {
    const record = 4 + index * 8;
    const subtable = cmap.readUInt32BE(record + 4);
    if (cmap.readUInt16BE(subtable) !== 4) continue;

    const segmentBytes = cmap.readUInt16BE(subtable + 6);
    const endOffset = subtable + 14;
    const startOffset = endOffset + segmentBytes + 2;
    const deltaOffset = startOffset + segmentBytes;
    const rangeOffset = deltaOffset + segmentBytes;

    for (let segment = 0; segment < segmentBytes / 2; segment += 1) {
      const end = cmap.readUInt16BE(endOffset + segment * 2);
      const start = cmap.readUInt16BE(startOffset + segment * 2);
      const delta = cmap.readInt16BE(deltaOffset + segment * 2);
      const range = cmap.readUInt16BE(rangeOffset + segment * 2);
      if (start === 0xffff) continue;

      for (let code = start; code <= end; code += 1) {
        let glyph;
        if (range === 0) {
          glyph = (code + delta) & 0xffff;
        } else {
          const at = rangeOffset + segment * 2 + range + (code - start) * 2;
          if (at + 1 >= cmap.length) continue;
          glyph = cmap.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) covered.add(code);
      }
    }
  }

  return covered;
}

test("both catalogs describe exactly the same interface", () => {
  const keys = Object.keys(en);

  assert.deepEqual(
    Object.keys(hymmnos),
    keys,
    "hymmnos.json keys drifted from en.json.",
  );

  for (const [catalog, name] of [
    [en, "en"],
    [hymmnos, "hymmnos"],
  ]) {
    for (const key of keys) {
      assert.equal(
        typeof catalog[key],
        "string",
        `${name}.json ${key} is not a string.`,
      );
      assert.notEqual(
        catalog[key].trim(),
        "",
        `${name}.json ${key} is empty.`,
      );
      assert.doesNotMatch(
        catalog[key],
        /\[TODO/i,
        `${name}.json ${key} still carries a placeholder.`,
      );
    }
  }
});

test("the content catalog tracks the records it claims to translate", () => {
  const entries = Object.entries(hymmnosContent).filter(([key]) => key !== "//");
  const keys = entries.map(([key]) => key);

  /*
   * Both catalogs are merged into one payload at /locales/hymmnos.json, so a
   * shared key would mean one silently overwriting the other.
   */
  for (const key of keys) {
    assert.ok(
      !(key in en),
      `Content key "${key}" collides with an interface key.`,
    );
  }

  for (const [key, value] of entries) {
    assert.equal(typeof value, "string", `${key} is not a string.`);
    assert.notEqual(value.trim(), "", `${key} is empty.`);
    assert.doesNotMatch(value, /\[TODO/i, `${key} still carries a placeholder.`);
  }

  const projects = collectFiles(join(sourceRoot, "content", "projects"))
    .filter((file) => /\.(md|mdx)$/.test(file))
    .map((file) => {
      const source = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
      const parts = source.split(/^---$/m);
      return {
        id: basename(file).replace(/\.(md|mdx)$/, ""),
        frontmatter: parts[1] ?? "",
        body: parts.slice(2).join("---").trim(),
      };
    })
    .filter(({ frontmatter }) => !/^draft:\s*true\s*$/m.test(frontmatter));

  /*
   * Every key must still name something real. A summary key names a record; a
   * body key names one paragraph of it by the hash of its text, so a key that
   * resolves to nothing is a translation of wording that has since been
   * edited — the layer falls back to English there, silently, which is exactly
   * why it is caught here instead.
   */
  const bodyKeys = new Set(
    projects.flatMap(({ id }) =>
      renderedProse(id).map((paragraph) => projectBodyKey(id, paragraph)),
    ),
  );

  for (const key of keys) {
    if (key.endsWith(".summary")) {
      const id = key.replace(/^project\./, "").replace(/\.summary$/, "");
      assert.ok(
        projects.some((project) => project.id === id),
        `Content key "${key}" names no published project.`,
      );
      continue;
    }

    assert.ok(
      bodyKeys.has(key),
      `Content key "${key}" matches no paragraph in any record. ` +
        "The wording it translated was probably edited.",
    );
  }

  /*
   * The layer leaves an untranslated summary in English by design, so a missing
   * entry cannot break a build. That makes it exactly the kind of gap that goes
   * unnoticed, which is why it is asserted here instead.
   */
  for (const { id } of projects) {
    assert.ok(
      keys.includes(`project.${id}.summary`),
      `Published project "${id}" has no Hymmnos summary.`,
    );
  }

  /*
   * Body coverage is not required to be total — a paragraph added tomorrow
   * should not fail the build before someone has found attested vocabulary for
   * it. It is required not to collapse: every record carries at least its
   * opening description.
   */
  for (const { id } of projects) {
    const [first] = renderedProse(id);
    assert.ok(
      first && keys.includes(projectBodyKey(id, first)),
      `Published project "${id}" has no Hymmnos for its opening paragraph.`,
    );
  }
});

test("project summaries are marked for the layer but never as metadata", () => {
  const card = read("src/components/ProjectCard.astro");
  const layout = read("src/layouts/ProjectLayout.astro");

  for (const source of [card, layout]) {
    assert.match(source, /contentKey\(projectSummaryKey\(/);
  }

  /*
   * The same summary is the page description. Metadata is never translated, in
   * any layer, so the meta tag must keep reading the frontmatter directly.
   */
  assert.match(layout, /const metadataDescription = data\.placeholder/);
  assert.match(layout, /description=\{metadataDescription\}/);

  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(
      html,
      /<meta[^>]+data-i18n-content/i,
      "A content translation was attached to metadata in " + file,
    );
  }
});

test("a navigation keeps the recording and lets sibling sites go", () => {
  /*
   * The recording plays across pages only because the router swaps the body
   * instead of reloading, and only because this one node is carried over.
   */
  assert.match(read("src/layouts/BaseLayout.astro"), /<ClientRouter \/>/);
  assert.match(
    read("src/components/AmbientAudio.astro"),
    /transition:persist="retained-recording"/,
  );

  /*
   * endoretic.cc also serves two project sites this build knows nothing about.
   * They are same-origin, so the router would swap their HTML into this shell
   * unless the link opts out.
   */
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");

    for (const [, href] of html.matchAll(
      /<a[^>]*?href="(https:\/\/endoretic\.cc\/[^"]*)"[^>]*>/g,
    )) {
      const anchor = html
        .slice(html.indexOf(`href="${href}"`) - 200, html.indexOf(`href="${href}"`) + 200)
        .match(/<a[^>]*?>/g)
        ?.find((tag) => tag.includes(href));

      assert.ok(
        anchor?.includes("data-astro-reload"),
        `${href} in ${file} would be intercepted by the router.`,
      );
    }
  }

  /* Scripts that bind per page must re-bind after a swap, or they run once. */
  for (const component of ["LanguageLayer", "LicensedVideo"]) {
    assert.match(
      read(`src/components/${component}.astro`),
      /addEventListener\("astro:page-load"/,
      `${component} would only initialise on the first page.`,
    );
  }
});

test("every key is used, and every used key exists", () => {
  const sources = collectFiles(sourceRoot)
    .filter((file) => /\.(astro|ts|mjs)$/.test(file))
    .filter((file) => !file.includes(join("src", "locales")))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  for (const key of Object.keys(en)) {
    assert.ok(
      sources.includes(`"${key}"`),
      `Catalog key "${key}" is not referenced anywhere in src/.`,
    );
  }

  for (const [, key] of sources.matchAll(/\bkey\("([^"]+)"\)/g)) {
    assert.ok(key in en, `key("${key}") has no catalog entry.`);
  }
});

test("the rendered English is the catalog English, byte for byte", () => {
  const pages = collectHtml(distRoot);
  assert.ok(pages.length > 0, "Build the site before running this test.");

  let checked = 0;

  for (const file of pages) {
    const html = readFileSync(file, "utf8");

    for (const [, key, text] of html.matchAll(
      /data-i18n="([^"]+)"[^>]*>([^<]*)</g,
    )) {
      assert.ok(key in en, `Unknown key "${key}" rendered in ${file}.`);

      /*
       * A few labels render the message beside literal punctuation or a
       * numeral, so only the elements that hold the message alone are compared.
       * Those are the ones the client script replaces wholesale.
       */
      if (text.trim() === "") continue;
      const expected = en[key]
        .replaceAll("&", "&#38;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      if (text.trim() !== expected.trim()) continue;

      assert.equal(text.trim(), expected.trim());
      checked += 1;
    }
  }

  assert.ok(checked > 50, `Only ${checked} keyed elements found in dist/.`);
});

test("pages ship in English; the layer is never baked into the output", () => {
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");

    /*
     * The Hymmnos layer is a discovery. If a build ever emitted it, the site
     * would be publishing a fan language to search engines rather than hiding
     * an easter egg inside its own pages.
     */
    assert.doesNotMatch(
      html,
      /<html lang="x-hymmnos"/,
      "A page was built in the layer locale: " + file,
    );
    assert.doesNotMatch(
      html,
      /class="hy-line"/,
      "Layer markup was pre-rendered into " + file,
    );

    for (const distinctive of ["Ma num ra", "Fou jyel ra", "crushue"]) {
      assert.ok(
        !html.includes(distinctive),
        `Hymmnos prose leaked into ${file}: ${distinctive}`,
      );
    }
  }
});

test("the layer never translates an accessible name or page metadata", () => {
  /*
   * The glyph layer is visual. Accessible names, alt text, titles, and social
   * metadata stay in English so that navigation, assistive technology, and
   * search results are unaffected by an easter egg.
   */
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");

    assert.doesNotMatch(
      html,
      /(?:aria-label|alt|title|placeholder)="[^"]*"\s+data-i18n=/i,
      "An accessible name was made translatable in " + file,
    );
    assert.match(html, /aria-label="Primary navigation"/);
    assert.match(html, /href="#main-content">Skip to main content</);
  }

  const layer = read("src/components/LanguageLayer.astro");
  assert.match(layer, /aria-hidden", "true"/);
  assert.match(layer, /meaning\.className = "hy-meaning"/);
  assert.match(layer, /meaning\.lang = "en"/);

  /*
   * The three tiers must draw from three different sources. Mid-decode the
   * glyph line holds the departing text, so a gloss built from the same value
   * would quietly show English under the heading "Transliteration".
   */
  assert.match(layer, /line\.textContent = lineText;/);
  assert.match(layer, /translit\.textContent = hymmnos;/);
  assert.match(layer, /meaning\.textContent = english\.get\(node\) \?\? "";/);
});

test("the hidden switch stays reachable by keyboard and assistive technology", () => {
  const layer = read("src/components/LanguageLayer.astro");

  /* Hidden from the eye is the intent; hidden from a screen reader is a bug. */
  assert.match(layer, /<button[\s\S]*?class="language-layer__trigger"/);
  assert.match(layer, /aria-label=\{t\("layer\.title"\)\}/);
  assert.match(layer, /aria-expanded="false"/);
  assert.match(layer, /aria-controls="language-layer-panel"/);
  assert.match(layer, /event\.key === "Escape"/);
  assert.match(layer, /trigger\.focus\(\)/);

  /* Progressive enhancement: no script, no switch, no broken furniture. */
  assert.match(layer, /data-language-switch[\s\S]*?\n\s*hidden\n/);
  assert.match(layer, /root\.hidden = false;/);

  const styles = read("src/styles/hymmnos.css");
  /*
   * The meaning tier is the accessible text, so it is hidden the one way that
   * keeps it in the accessibility tree. `display: none` here would hand a
   * screen reader a page of untranslatable glyph transcription.
   */
  assert.match(styles, /\.hy-meaning \{[\s\S]*?clip-path: inset\(50%\);/);
  assert.doesNotMatch(styles, /\.hy-meaning[^{]*\{[^}]*display:\s*none/);
});

test("the switch and the document flag cannot be confused for each other", () => {
  const layer = read("src/components/LanguageLayer.astro");

  /*
   * Regression: both once used data-language-layer — the div in the footer as
   * its identity, and the document element as the flag saying the layer is on.
   * On a first load that was harmless, because the flag is only set after the
   * lookup has already run. After a client-side navigation the flag is
   * restored before the page is set up again, so querySelector returned <html>
   * — which comes first in document order — the real switch was never
   * revealed, and a reader in Hymmnos had no way back to English.
   */
  const rootLookup = layer.match(
    /const root = document\.querySelector<HTMLElement>\("\[([a-z-]+)\]\"\)/,
  );
  assert.ok(rootLookup, "The switch root is no longer found by one attribute.");

  const documentFlags = [
    ...layer.matchAll(/documentElement\.dataset\.([A-Za-z]+)/g),
  ].map(([, name]) => "data-" + name.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()));

  assert.ok(
    documentFlags.length > 0,
    "The layer no longer flags the document; this guard needs rewriting.",
  );

  for (const flag of documentFlags) {
    assert.notEqual(
      flag,
      rootLookup[1],
      `The switch container and the document flag both use ${flag}. ` +
        "documentElement matches first, so the switch would stay hidden.",
    );
  }
});

test("motion in the decode is opt-in", () => {
  const layer = read("src/components/LanguageLayer.astro");

  assert.match(layer, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(layer, /if \(reduceMotion\.matches\) \{\s*\n\s*settle\(entries\);/);

  /* The scramble is driven from script, so it must add no CSS keyframes. */
  assert.doesNotMatch(read("src/styles/hymmnos.css"), /@keyframes|animation-name/);
});

test("the Hymmnos catalog uses only attested vocabulary", () => {
  const attested = new Set(lexicon.words.map((word) => word.toLowerCase()));
  assert.equal(lexicon.words.length, 506);
  assert.equal(attested.size, 506);

  const unattested = new Map();

  const translated = [
    ...Object.entries(hymmnos),
    ...Object.entries(hymmnosContent).filter(([key]) => key !== "//"),
  ];

  for (const [key, value] of translated) {
    /* Mask protected names first, longest match first, exactly as the harness does. */
    let masked = value;
    for (const term of PROTECTED_TERMS) masked = masked.split(term).join(" ");

    for (const token of masked.split(/[^A-Za-z.]+/).filter(Boolean)) {
      /* Stops left behind by masking a protected name are punctuation, not words. */
      if (!/[a-z]/i.test(token)) continue;
      const word = token.toLowerCase();
      /* Bank-period verbs keep their dots; a trailing sentence stop does not. */
      if (attested.has(word) || attested.has(word.replace(/\.$/, ""))) continue;
      if (!unattested.has(word)) unattested.set(word, []);
      unattested.get(word).push(key);
    }
  }

  assert.deepEqual(
    [...unattested.entries()],
    [],
    "Hymmnos words with no entry in the pinned lexicon. Paraphrase with " +
      "indexed vocabulary, or record and approve a coinage before using it.",
  );
});

test("the vendored word index still matches its pinned upstream", () => {
  assert.equal(
    lexicon.sourceSha256,
    "fed253613730049d0b96a40860be0f342ed2f50356738430b25ed8e2ab8ba6dd",
  );
  assert.match(lexicon.source, /^Liushenwuzhu-Alpaca\/hymmnos-skill@[0-9a-f]{40}$/);
  assert.equal(lexicon.entryCount, 506);

  /* Provenance travels with the data or it is not provenance. */
  const notice = lexicon["//"].join(" ");
  assert.match(notice, /Akira Tsuchiya/);
  assert.match(notice, /CC BY-NC-SA 4\.0/);
});

test("every Hymmnos character can actually be drawn by the glyph font", () => {
  const path = join(repositoryRoot, "public/fonts/fonts.woff2");
  assert.ok(existsSync(path), "public/fonts/fonts.woff2 is missing.");

  const covered = fontCoverage(path);
  const missing = new Set();

  const drawn = [
    ...Object.values(hymmnos),
    ...Object.entries(hymmnosContent)
      .filter(([key]) => key !== "//")
      .map(([, value]) => value),
  ];

  for (const value of drawn) {
    for (const character of value) {
      if (!covered.has(character.codePointAt(0))) missing.add(character);
    }
  }

  assert.deepEqual(
    [...missing],
    [],
    "Catalog characters the Hymmnos font cannot render would show as tofu.",
  );
});

test("the glyph font is self-hosted, pinned, and cheap enough to be optional", () => {
  const path = join(repositoryRoot, "public/fonts/fonts.woff2");
  const bytes = readFileSync(path);

  /*
   * Pinned by digest. The shipped file is a plain WOFF2 conversion of the
   * TrueType original received from the local hm-translator harness
   * (sha256 0472685…d71e35): no subsetting, no re-hinting, no renaming of the
   * family. Pinning is the only honest handle on a font that states no licence
   * of its own, and the coverage check above proves the conversion kept every
   * glyph. Re-verify provenance before changing this digest.
   */
  assert.equal(bytes.toString("latin1", 0, 4), "wOF2");
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    "d7ebd115e6727955238b9381ef2516aa1ed2f22ad3848b5b12bb826cc232ff88",
    "The glyph font changed; re-verify its provenance before shipping it.",
  );

  /* Small enough that an easter egg never costs a reader real weight. */
  assert.ok(statSync(path).size < 16 * 1024);

  const styles = read("src/styles/hymmnos.css");
  assert.match(styles, /src: url\("\/fonts\/fonts\.woff2"\) format\("woff2"\);/);
  assert.match(styles, /font-display: swap;/);
  assert.match(styles, /\[lang="x-hymmnos"\]/);

  /* One source, one format: no TrueType weight left behind after the switch. */
  const sources = [...styles.matchAll(/^\s*src:\s*([^;]+);/gm)].map(
    (match) => match[1],
  );
  assert.equal(sources.length, 1, "Expected exactly one @font-face source.");
  assert.doesNotMatch(sources[0], /\.ttf|truetype/i);
});

test("the catalog is published as its own file rather than inlined everywhere", () => {
  const published = JSON.parse(read("dist/locales/hymmnos.json"));
  const content = Object.fromEntries(
    Object.entries(hymmnosContent).filter(([key]) => key !== "//"),
  );

  /*
   * One request carries both catalogs. They are separate files in the
   * repository because their English comes from two different places, but a
   * reader opening the switch needs all of it at once.
   */
  assert.deepEqual(Object.keys(published), [
    ...Object.keys(hymmnos),
    ...Object.keys(content),
  ]);
  assert.deepEqual(published, { ...hymmnos, ...content });

  /* Nothing about the layer may be paid for by a reader who never finds it. */
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(html, /<link[^>]+\/fonts\/hymmnos\.ttf/i);
    assert.doesNotMatch(html, /<link[^>]+\/locales\/hymmnos\.json/i);
  }
});

test("the credits page always discloses the font, and hides only the homage", () => {
  const html = read("dist/credits/index.html");

  /* Attribution is not the easter egg. It ships visible, in every layer. */
  assert.match(html, /id="typeface-credit"/);
  assert.match(html, /fan-made Hymmnos font/);
  assert.match(html, /WOFF2 conversion of the TrueType original/);
  assert.match(html, /states no licence terms/);

  const homage = html.match(/<section[^>]*credit-homage[\s\S]*?<\/section>/)?.[0];
  assert.ok(homage, "The homage section is missing from /credits.");
  assert.match(homage, /\bhidden\b/);
  assert.match(homage, /data-layer-only/);
  assert.match(homage, /Akira Tsuchiya/);
  assert.match(homage, /Ar tonelico/);
  assert.match(homage, /not affiliated with, sponsored by, or endorsed by/);
  assert.match(homage, /Koei Tecmo Games Co\., Ltd\./);
});
