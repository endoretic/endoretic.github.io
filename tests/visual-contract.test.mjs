import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parse } from "yaml";

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

test("the home page uses responsive original art and defers optional audio", () => {
  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  const heroArt = html.match(
    /<picture\b[^>]*hero-media__art[\s\S]*?<\/picture>/i,
  )?.[0];
  const audio = html.match(/<audio\b[^>]*>[\s\S]*?<\/audio>/i)?.[0];

  assert.ok(heroArt, "Missing local original hero illustration");
  assert.match(heroArt, /\/media\/generated\/hero-afterlight-01-640\.avif 640w/i);
  assert.match(heroArt, /\/media\/generated\/hero-afterlight-01-1600\.webp 1600w/i);
  assert.match(heroArt, /\bwidth="1600"[^>]*\bheight="900"/i);
  assert.match(heroArt, /\balt="[^"]+"/i);
  assert.match(html, /STILL \/ 01/i);
  assert.match(html, />16:9</i);
  assert.match(html, /Afterlight study/i);
  assert.doesNotMatch(html, /<video\b/i);
  assert.doesNotMatch(html, /hero-radio-array-01|identity-reac-01/i);

  assert.ok(audio, "Missing optional ambient audio element");
  assert.match(audio, /\bpreload="none"/i);
  assert.doesNotMatch(audio, /\bsrc\s*=|<source\b/i);
  assert.match(html, /data-sources="[^\"]*\/media\/audio\/ambient-cylinder-seven-01\.mp3/i);
  assert.match(html, /data-notation-motif/);
  assert.match(html, /data-scene-mode="image"/i);
  assert.match(html, /\/media\/generated\/foreground-megastructure-01-1024\.avif/i);
  assert.match(html, /foreground-artifact--megastructure/i);
  assert.match(html, /class="site-background-art"/i);
});

test("the monument is a document background and the hero rail stays record-sized", () => {
  const layout = readFileSync(
    join(repositoryRoot, "src/layouts/BaseLayout.astro"),
    "utf8",
  );
  const home = readFileSync(join(sourceRoot, "pages/index.astro"), "utf8");
  const globalCss = readFileSync(
    join(repositoryRoot, "src/styles/global.css"),
    "utf8",
  );

  assert.match(layout, /class="site-background-art"/);
  assert.match(layout, /ForegroundArtifact variant="megastructure"/);
  assert.doesNotMatch(home, /ForegroundArtifact|SceneVignette/);
  assert.match(globalCss, /body > \.site-background-art\s*\{[\s\S]*position:\s*absolute/);
  assert.doesNotMatch(globalCss, /\.hero__grid::before/);
  assert.match(globalCss, /\.hero__copy::before\s*\{[\s\S]*height:\s*5\.75rem/);
});

test("the owner-directed pale interface remains the primary visual surface", () => {
  const tokens = readFileSync(
    join(repositoryRoot, "src/styles/tokens.css"),
    "utf8",
  );
  const globalCss = readFileSync(
    join(repositoryRoot, "src/styles/global.css"),
    "utf8",
  );

  assert.match(tokens, /color-scheme:\s*light/);
  assert.match(tokens, /--surface-0:\s*#d8d3bd/);
  assert.match(tokens, /--ink-950:\s*#292a26/);
  assert.match(globalCss, /body\s*\{[\s\S]*var\(--surface-0\)/);
  assert.match(
    globalCss,
    /\.site-nav a\[aria-current="page"\][\s\S]*background:\s*var\(--ink-950\)/,
  );
  assert.match(
    globalCss,
    /@media \(max-width:\s*38rem\)[\s\S]*\.site-nav\s*\{[\s\S]*grid-template-columns:\s*repeat\(6/,
  );
});

test("raster scenes retain their inline SVG loading fallback", () => {
  const component = readFileSync(
    join(sourceRoot, "components/SceneVignette.astro"),
    "utf8",
  );

  assert.match(component, /mode\s*=\s*"image"/);
  assert.match(component, /class="scene-vignette__image"/);
  assert.match(component, /class="scene-vignette__fallback"/);
  assert.match(component, /onerror="this\.closest\('picture'\)\.hidden=true"/);
});

test("optional media controllers preserve poster and user-gesture fallbacks", () => {
  const videoComponent = readFileSync(
    join(sourceRoot, "components/LicensedVideo.astro"),
    "utf8",
  );
  const audioComponent = readFileSync(
    join(sourceRoot, "components/AmbientAudio.astro"),
    "utf8",
  );

  assert.match(videoComponent, /desktop\.matches/);
  assert.match(videoComponent, /connection\?\.saveData\s*!==\s*true/);
  assert.match(videoComponent, /prefers-reduced-motion:\s*reduce/);
  assert.match(videoComponent, /video\.play\(\)\.catch\(usePoster\)/);
  assert.match(videoComponent, /data-video-state="poster"/);
  assert.match(videoComponent, /video\.addEventListener\("error",\s*usePoster/);

  assert.match(audioComponent, /<audio preload="none" hidden><\/audio>/);
  assert.match(audioComponent, /enable\.addEventListener\("click"/);
  assert.match(audioComponent, /document\.createElement\("source"\)/);
  assert.match(audioComponent, /localStorage\.setItem/);
  assert.match(audioComponent, /visibilitychange/);
  assert.match(audioComponent, /document\.hidden\s*&&\s*!audio\.paused/);
  assert.match(
    audioComponent,
    /<button\b[^>]*data-audio-toggle[^>]*disabled>/,
  );
  assert.match(audioComponent, /type="range"/);
});

test("motion is opt-in and completely disabled for reduced-motion users", () => {
  const css = readFileSync(
    join(repositoryRoot, "src/styles/motion.css"),
    "utf8",
  );

  assert.match(css, /prefers-reduced-motion:\s*no-preference/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /animation:\s*none\s*!important/);
  assert.match(css, /transition:\s*none\s*!important/);
  assert.match(css, /scroll-behavior:\s*auto\s*!important/);
  assert.doesNotMatch(css, /@keyframes|animation-name/);

  const layout = readFileSync(
    join(repositoryRoot, "src/layouts/BaseLayout.astro"),
    "utf8",
  );
  const compiledCss = collectFiles(join(distRoot, "_astro"))
    .filter((file) => file.endsWith(".css"))
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  assert.match(layout, /import\s+["']\.\.\/styles\/motion\.css["']/);
  assert.match(compiledCss, /prefers-reduced-motion:\s*no-preference/);
  assert.match(compiledCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(compiledCss, /animation:\s*none\s*!important/);
  assert.match(compiledCss, /transition:\s*none\s*!important/);
});

test("the notation motif is original, decorative, and never a text replacement", () => {
  const component = readFileSync(
    join(repositoryRoot, "src/components/NotationMotif.astro"),
    "utf8",
  );

  assert.match(component, /Original endoretic\.cc interval mark/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(component, /data-notation-motif/);
  assert.doesNotMatch(component, /aria-label|role="img"/);
});

test("the notation is a set of glyphs rather than one repeated mark", () => {
  const component = readFileSync(
    join(repositoryRoot, "src/components/NotationMotif.astro"),
    "utf8",
  );
  const glyphs = component.match(/\{ d: "/g) ?? [];

  // A single repeated mark reads as a logo, which is the opposite of the
  // intent: the set exists to imply a larger surrounding index.
  assert.ok(
    glyphs.length >= 8,
    `Expected at least 8 glyphs, found ${glyphs.length}`,
  );

  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  const rendered = new Set(
    [...html.matchAll(/data-notation-motif><path d="([^"]+)"/g)].map(
      (match) => match[1],
    ),
  );
  assert.ok(
    rendered.size >= 2,
    "Records should not all render the same notation glyph",
  );
});

test("record bucket selection is stable, in range, and well spread", () => {
  const source = readFileSync(join(sourceRoot, "lib/hash.ts"), "utf8");

  // `^=` produces a signed 32-bit result. Without normalising before the
  // modulo, the returned index goes negative and every lookup is undefined.
  assert.match(source, /\(hash \^ \(hash >>> 16\)\) >>> 0/);

  // FNV-1a on its own mixes its low bits poorly for short slugs, and the
  // modulo reads exactly those bits, which collapsed most real project slugs
  // onto one bucket. The finalizer must survive.
  assert.match(source, /0x7feb352d/);
  assert.match(source, /0x846ca68b/);
});

test("the note reading surface protects measure, overflow, and paper contrast", () => {
  const layout = readFileSync(
    join(repositoryRoot, "src/layouts/NoteLayout.astro"),
    "utf8",
  );
  const prose = readFileSync(
    join(repositoryRoot, "src/styles/prose.css"),
    "utf8",
  );
  const tokens = readFileSync(
    join(repositoryRoot, "src/styles/tokens.css"),
    "utf8",
  );

  assert.match(layout, /<article class:list=/);
  assert.match(layout, /note-page--/);
  assert.match(layout, /class="prose"/);
  assert.match(tokens, /--reading-text:\s*70ch/);
  assert.match(prose, /\.note-page--paper/);
  assert.match(prose, /\.note-page--paper \.prose blockquote[\s\S]*color:\s*#48483f/);
  assert.match(prose, /\.note-page--paper :focus-visible[\s\S]*outline-color:\s*var\(--paper-ink\)/);
  assert.match(prose, /\.prose pre[\s\S]*overflow-x:\s*auto/);
  assert.match(prose, /\.prose table[\s\S]*overflow-x:\s*auto/);
  assert.match(prose, /overflow-wrap:\s*anywhere/);
});
