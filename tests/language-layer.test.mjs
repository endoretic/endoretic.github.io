import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { hymmnosParts, hymmnosTranscription } from "../src/lib/hymmnos-text.mjs";
import { normaliseProse, projectBodyKey } from "../src/lib/prose-key.mjs";
import { brotliDecompressSync } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");

/* Sources are checked out with CRLF here; assertions are about content. */
const read = (...parts) =>
  readFileSync(join(repositoryRoot, ...parts), "utf8").replace(/\r\n/g, "\n");
const readJson = (...parts) => JSON.parse(read(...parts));

// Decode rendered text, allowing equivalent entity spelling and whitespace.
const decodeText = (html) => normaliseProse(html.replace(/<[^>]+>/g, "")
  .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity) => {
    if (entity.startsWith("#")) {
      const hex = entity[1].toLowerCase() === "x";
      return String.fromCodePoint(parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10));
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[entity.toLowerCase()];
  }));

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

test("project summaries are translated visibly while metadata keeps the original", () => {
  for (const [contentKey] of Object.entries(hymmnosContent)) {
    const match = contentKey.match(/^project\.(.+)\.summary$/);
    if (!match) continue;
    const html = read("dist/works", match[1], "index.html");
    const summary = [...html.matchAll(/<p\b[^>]*data-i18n-content="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g)]
      .find(([, key]) => key === contentKey);
    assert.ok(summary, `Missing visible summary ${contentKey}`);
    const meta = [...html.matchAll(/<meta\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => /\bname="description"/.test(tag));
    assert.ok(meta, `Missing description for ${match[1]}`);
    const description = meta.match(/\bcontent="([^"]*)"/)?.[1];
    assert.equal(decodeText(description ?? ""), decodeText(summary[2]));
  }
});
test("published sibling-site links opt out of the local router", () => {
  const destinations = new Set();
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    for (const [anchor, href] of html.matchAll(/<a\b[^>]*\bhref="(https:\/\/endoretic\.cc\/[^\"]*)"[^>]*>/g)) {
      const path = new URL(href).pathname;
      if (path === "/" || /^\/(?:works|notes|about|credits)(?:\/|$)/.test(path)) continue;
      assert.match(anchor, /\bdata-astro-reload(?:[\s=>])/,
        `${href} in ${file} would be intercepted by the router.`);
      destinations.add(path);
    }
  }
  for (const path of ["/pjsk-tier-maker/", "/score-calculator/"]) {
    assert.ok(destinations.has(path), `No sibling-site link checked for ${path}`);
  }
});
test("rendered English matches its catalog entry", () => {
  let checked = 0;
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    for (const [, , key, text] of html.matchAll(
      /<([a-z][\w:-]*)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1>/gi,
    )) {
      assert.ok(key in en, `Unknown key ${key} in ${file}`);
      assert.equal(decodeText(text), normaliseProse(en[key]),
        `Wrong rendered text for ${key} in ${file}`);
      checked += 1;
    }
  }
  assert.ok(checked > 50, `Only ${checked} keyed elements found in dist/`);
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

test("page metadata is never marked for translation", () => {
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    for (const [tag] of html.matchAll(/<(?:html|meta|title|img)\b[^>]*>/gi)) {
      assert.doesNotMatch(tag, /\bdata-i18n(?:-content)?=/,
        `Metadata or an image was marked for replacement in ${file}`);
    }
  }
});
test("the initial language switch has a named button and a matching panel", () => {
  for (const file of collectHtml(distRoot)) {
    const html = readFileSync(file, "utf8");
    const trigger = [...html.matchAll(/<button\b[^>]*>/g)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes('aria-label="' + en["layer.title"] + '"'));
    assert.ok(trigger, `Missing language button in ${file}`);
    assert.match(trigger, /\baria-expanded="false"/);
    const panelId = trigger.match(/\baria-controls="([^"]+)"/)?.[1];
    assert.ok(panelId, `Language button has no panel target in ${file}`);
    const panel = [...html.matchAll(/<[a-z][\w:-]*\b[^>]*>/gi)]
      .map(([tag]) => tag)
      .find((tag) => tag.includes('id="' + panelId + '"'));
    assert.ok(panel, `Language panel ${panelId} is missing in ${file}`);
    assert.match(panel, /\bhidden(?:[\s=>])/);
  }
});
test("Hymmnos words use the index; borrowings and lost fragments are explicit", () => {
  const attested = new Set(lexicon.words.map((word) => word.toLowerCase()));
  assert.equal(lexicon.words.length, 506);
  assert.equal(attested.size, 506);

  const unattested = new Map();

  const translated = [
    ...Object.entries(hymmnos),
    ...Object.entries(hymmnosContent).filter(([key]) => key !== "//"),
  ];

  for (const [key, value] of translated) {
    const parts = hymmnosParts(value);
    for (const part of parts) {
      assert.ok(part.text.trim() || part.kind === "text", `${key}: empty annotation`);
      assert.doesNotMatch(part.text, /[\[\]{}]/, `${key}: malformed annotation`);
    }
    const masked = parts.filter((part) => part.kind === "text")
      .map((part) => part.text).join(" ");

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
    "Unindexed Hymmnos: verify the word source, or explicitly mark a site borrowing. " +
      "The finite index is a spelling check, not a test of meaning or grammar.",
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
    const glyphText = hymmnosParts(value).filter((part) => part.kind === "text")
      .map((part) => part.text).join("");
    for (const character of glyphText) {
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

test("site annotations preserve words and punctuation without interpreting HTML", () => {
  const text = "Ma haf [[Zotero 10]], {{API}} en {{<script>}}.";
  assert.deepEqual(hymmnosParts(text), [
    { kind: "text", text: "Ma haf " },
    { kind: "borrow", text: "Zotero 10" },
    { kind: "text", text: ", " },
    { kind: "lost", text: "API" },
    { kind: "text", text: " en " },
    { kind: "lost", text: "<script>" },
    { kind: "text", text: "." },
  ]);
  assert.equal(hymmnosTranscription(text), "Ma haf Zotero 10, API en <script>.");
  assert.equal(hymmnosTranscription("[[PDF]]{{CSL}}"), "PDFCSL");
  assert.equal(hymmnosTranscription("Ma haf wart."), "Ma haf wart.");
  assert.equal(hymmnosTranscription("{{unfinished"), "{{unfinished");
});
