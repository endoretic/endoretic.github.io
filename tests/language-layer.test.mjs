import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { brotliDecompressSync } from "node:zlib";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");

/* Sources are checked out with CRLF here; assertions are about content. */
const read = (...parts) =>
  readFileSync(join(repositoryRoot, ...parts), "utf8").replace(/\r\n/g, "\n");
const readJson = (...parts) => JSON.parse(read(...parts));

const en = readJson("src/locales/en.json");
const hymmnos = readJson("src/locales/hymmnos.json");
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
  assert.match(layer, /data-language-layer[\s\S]*?\n\s*hidden\n/);
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

  for (const [key, value] of Object.entries(hymmnos)) {
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

  for (const value of Object.values(hymmnos)) {
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

  assert.deepEqual(Object.keys(published), Object.keys(hymmnos));
  assert.deepEqual(published, hymmnos);

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
