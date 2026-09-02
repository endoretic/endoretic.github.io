import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = join(repositoryRoot, "public");
const sourceRoot = join(repositoryRoot, "src");
const distRoot = join(repositoryRoot, "dist");
const generatedPlaceholder = "media/generated/hero-memory-transport.svg";

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

test("the public asset inventory contains only approved local generated files", () => {
  const actual = collectFiles(publicRoot)
    .map((file) => relative(publicRoot, file).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(actual, ["CNAME", "favicon.svg", generatedPlaceholder]);
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

test("the hero placeholder is small, inert, and explicitly repository-authored", () => {
  const sourcePath = join(publicRoot, generatedPlaceholder);
  const outputPath = join(distRoot, generatedPlaceholder);

  assert.equal(existsSync(sourcePath), true);
  assert.equal(existsSync(outputPath), true);
  assert.ok(statSync(sourcePath).size > 0);
  assert.ok(statSync(sourcePath).size < 100 * 1024);

  const svg = readFileSync(sourcePath, "utf8");
  assert.match(svg, /Repository-authored placeholder for endoretic\.cc/);
  assert.doesNotMatch(svg, /<(?:script|foreignObject|image)\b/i);
  assert.doesNotMatch(svg, /\b(?:href|src)\s*=\s*["']/i);
});

test("the home page uses the local placeholder with deliberate decorative semantics", () => {
  const html = readFileSync(join(distRoot, "index.html"), "utf8");
  const imageTag = html.match(
    /<img\b[^>]*hero-memory-transport\.svg[^>]*>/i,
  )?.[0];

  assert.ok(imageTag, "Missing generated hero placeholder image");
  assert.match(imageTag, /\balt=""/i);
  assert.match(html, /Local SVG \/ no external media/);
  assert.match(html, /data-notation-motif/);
  assert.doesNotMatch(html, /<(?:audio|video)\b/i);
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
  assert.match(css, /\.hero-media__trace--signal/);

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
