import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";
import { stableIndex } from "../src/lib/hash.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(repositoryRoot, "public");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");
const generatedArt = [
  "media/generated/hero-afterlight-01-640.avif",
  "media/generated/hero-afterlight-01-640.webp",
  "media/generated/hero-afterlight-01-1280.avif",
  "media/generated/hero-afterlight-01-1280.webp",
  "media/generated/hero-afterlight-01-1600.avif",
  "media/generated/hero-afterlight-01-1600.webp",
  "media/generated/hero-afterlight-01-1600.jpg",
  ...["relay", "console", "hall", "coast"].flatMap((scene) => [
    `media/generated/scene-${scene}-01-640.avif`,
    `media/generated/scene-${scene}-01-640.webp`,
    `media/generated/scene-${scene}-01-1280.avif`,
    `media/generated/scene-${scene}-01-1280.webp`,
    `media/generated/scene-${scene}-01-1600.jpg`,
  ]),
  ...["megastructure", "relic"].flatMap((artifact) => [
    `media/generated/foreground-${artifact}-01-640.avif`,
    `media/generated/foreground-${artifact}-01-640.webp`,
    `media/generated/foreground-${artifact}-01-1024.avif`,
    `media/generated/foreground-${artifact}-01-1024.webp`,
  ]),
  ...["monument", "vessel", "automaton"].flatMap((artwork) => [
    `media/generated/record-art-${artwork}-01-640.avif`,
    `media/generated/record-art-${artwork}-01-640.webp`,
    `media/generated/record-art-${artwork}-01-1024.avif`,
    `media/generated/record-art-${artwork}-01-1024.webp`,
  ]),
  ...[640, 1024].flatMap((width) => [
    `media/generated/spine-archive-study-01-${width}.avif`,
    `media/generated/spine-archive-study-01-${width}.webp`,
  ]),
];

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

test("the public asset inventory contains only generated or manifest-approved files", () => {
  const actual = collectFiles(publicRoot)
    .map((file) => relative(publicRoot, file).replaceAll("\\", "/"))
    .sort();
  const manifest = parse(
    readFileSync(join(sourceRoot, "data/assets.yml"), "utf8"),
  );
  const approvedMedia = manifest
    .filter((asset) => asset.status === "active")
    .flatMap((asset) => asset.local_files)
    .map((file) => file.replace(/^\//, ""));
  const expected = [
    "CNAME",
    "favicon.svg",
    // The Hymmnos glyph face. It sits outside public/media/ and outside the
    // asset manifest on purpose: that manifest encodes the first-release
    // licence allowlist, and this font carries no licence statement, so
    // admitting it there would have meant weakening the allowlist itself. It is
    // disclosed on /credits instead. See docs/HYMMNOS_LAYER.md.
    "fonts/fonts.woff2",
    ...generatedArt,
    ...approvedMedia,
  ].sort();

  assert.deepEqual(actual, expected);
});

test("unreviewed bundled media and data payloads cannot enter source", () => {
  const mediaExtensions = new Set([
    ".avif",
    ".flac",
    ".gif",
    ".jpeg",
    ".jpg",
    ".m4a",
    ".mov",
    ".mp3",
    ".mp4",
    ".ogg",
    ".otf",
    ".png",
    ".svg",
    ".ttf",
    ".wav",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
  ]);
  const sourceFiles = collectFiles(sourceRoot);
  const bundledMedia = sourceFiles
    .filter((file) => mediaExtensions.has(extname(file).toLowerCase()))
    .map((file) => relative(sourceRoot, file).replaceAll("\\", "/"));

  assert.deepEqual(bundledMedia, []);

  for (const file of sourceFiles) {
    if (![".astro", ".css", ".js", ".md", ".mdx", ".ts", ".yml", ".yaml"].includes(extname(file).toLowerCase())) {
      continue;
    }

    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(
      source,
      /data:(?:image|audio|video|font)\//i,
      "Embedded media payload found in " + relative(repositoryRoot, file),
    );
  }
});

test("the original illustrations have compact responsive local derivatives", () => {
  for (const file of generatedArt) {
    const sourcePath = join(publicRoot, file);
    const outputPath = join(distRoot, file);

    assert.equal(existsSync(sourcePath), true, "Missing public/" + file);
    assert.equal(existsSync(outputPath), true, "Missing dist/" + file);
    assert.ok(statSync(sourcePath).size > 0, "Empty public/" + file);
    assert.ok(statSync(sourcePath).size < 200 * 1024, "Oversized public/" + file);
  }
});

test("the home page serves responsive original art", () => {
  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  const heroArt = [...html.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi)]
    .map(([picture]) => picture)
    .find((picture) => picture.includes("/media/generated/hero-afterlight-01-"));
  assert.ok(heroArt, "Missing original hero illustration");
  assert.match(heroArt, /srcset="[^"]+ 640w[^"]+ 1600w"/);
  assert.match(heroArt, /<img\b(?=[^>]*\bwidth="1600")(?=[^>]*\bheight="900")(?=[^>]*\balt="[^"]+")[^>]*>/);
  assert.doesNotMatch(html, /<video\b|hero-radio-array-01|identity-reac-01/i);
});

test("archive indexes serve their local decorative scenes", () => {
  for (const [route, scene] of [
    ["works", "relay"], ["notes", "hall"], ["about", "console"], ["credits", "coast"],
  ]) {
    const html = readFileSync(join(distRoot, route, "index.html"), "utf8");
    const picture = [...html.matchAll(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi)]
      .map(([markup]) => markup)
      .find((markup) => markup.includes(`/media/generated/scene-${scene}-01-`));
    assert.ok(picture, `Missing ${scene} on /${route}/`);
    assert.match(picture, /srcset="[^"]+ 640w[^"]+ 1280w"/);
    assert.match(picture, /<img\b[^>]*\balt=""/);
  }
});

test("rendered notation is decorative and varies between records", () => {
  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  const motifs = [...html.matchAll(/<svg\b[^>]*\bdata-notation-motif[^>]*>[\s\S]*?<\/svg>/g)];
  assert.ok(motifs.length > 1, "Expected notation beside multiple records");
  const drawings = new Set();
  for (const [svg] of motifs) {
    const tag = svg.slice(0, svg.indexOf(">") + 1);
    assert.match(tag, /aria-hidden="true"/);
    assert.doesNotMatch(tag, /aria-label=|role="img"/);
    drawings.add(svg.slice(svg.indexOf(">") + 1));
  }
  assert.ok(drawings.size > 1, "All records rendered the same notation");
});

test("record bucket selection is deterministic, bounded, and varied", () => {
  const slugs = readdirSync(join(sourceRoot, "content/projects"))
    .filter((file) => /\.(md|mdx)$/.test(file))
    .map((file) => file.replace(/\.(md|mdx)$/, ""));
  const seeds = ["", "柳州屏山大桥", ...slugs,
    ...Array.from({ length: 1000 }, (_, index) => `record-${index}`)];
  for (const buckets of [1, 4, 12, 1000]) {
    for (const seed of seeds) {
      const index = stableIndex(seed, buckets);
      assert.ok(Number.isInteger(index) && index >= 0 && index < buckets,
        `Invalid bucket ${index} for ${seed} / ${buckets}`);
      assert.equal(stableIndex(seed, buckets), index);
    }
  }
  const selected = slugs.map((slug) => stableIndex(slug, 12));
  assert.ok(new Set(selected).size >= 3, "Project marks collapsed into too few buckets");
});
