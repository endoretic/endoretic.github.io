import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(repositoryRoot, "dist");

const requiredFiles = [
  "index.html",
  "works/index.html",
  "works/zotero-wallpaper/index.html",
  "works/zontex/index.html",
  "notes/index.html",
  "notes/liuzhou-pingshan-bridge/index.html",
  "about/index.html",
  "credits/index.html",
  "404.html",
  "CNAME",
];

function collectHtml(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectHtml(entryPath);
    }

    return entry.name.endsWith(".html") ? [entryPath] : [];
  });
}

test("all required static routes and the CNAME are generated", () => {
  for (const file of requiredFiles) {
    assert.equal(existsSync(join(dist, file)), true, "Missing dist/" + file);
  }

  assert.equal(readFileSync(join(dist, "CNAME"), "utf8").trim(), "endoretic.cc");
});

test("draft notes are excluded from production", () => {
  assert.equal(
    existsSync(join(dist, "notes/draft-template/index.html")),
    false,
  );

  const output = collectHtml(dist)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");

  assert.doesNotMatch(output, /TODO：随笔标题/);
  assert.doesNotMatch(output, /未发布模板/);
});

test("the first published note keeps its source clear and serves responsive local art", () => {
  const html = readFileSync(
    join(dist, "notes/liuzhou-pingshan-bridge/index.html"),
    "utf8",
  );

  assert.match(html, /<html lang="zh-CN">/);
  assert.match(html, /柳州屏山大桥/);
  assert.match(html, /本文含虚构整理与想象性叙述/);
  assert.match(html, /<dt data-i18n="field.lastUpdated">Last updated<\/dt>/);
  assert.match(html, /<time datetime="2026-09-04">2026-W36-5<\/time>/);
  assert.match(html, /spine-archive-study-01-640\.avif 640w/);
  assert.match(html, /spine-archive-study-01-1024\.webp 1024w/);
  assert.match(html, /alt="从高处纵向望向柳州城区[^"<>]+"/);
  assert.doesNotMatch(html, /https?:\/\/[^"']+\.(?:avif|jpe?g|png|webp)/i);
});

test("visible dates use ISO week-date notation", () => {
  const notesIndex = readFileSync(join(dist, "notes/index.html"), "utf8");
  const credits = readFileSync(join(dist, "credits/index.html"), "utf8");

  assert.match(notesIndex, /<dt data-i18n="field.date">Date<\/dt>/);
  assert.match(notesIndex, /<time datetime="2026-09-04">2026-W36-5<\/time>/);
  assert.match(
    credits,
    /<span data-i18n="credits.retrieved">Retrieved<\/span> 2026-W36-5/,
  );
});

test("generated pages keep a semantic progressive-enhancement shell", () => {
  for (const file of collectHtml(dist)) {
    const html = readFileSync(file, "utf8");
    const mainCount = (html.match(/<main\b/g) ?? []).length;
    const h1Count = (html.match(/<h1\b/g) ?? []).length;

    assert.match(html, /<html lang="(?:en|zh-CN)">/);
    assert.match(html, /href="#main-content"/);
    assert.match(html, /<main id="main-content" tabindex="-1"/);
    assert.match(html, /aria-label="Primary navigation"/);
    assert.equal(mainCount, 1, "Expected one main landmark in " + file);
    assert.equal(h1Count, 1, "Expected one h1 in " + file);
    assert.doesNotMatch(html, /tabindex="[1-9][0-9]*"/);
    assert.doesNotMatch(html, /<img\b(?![^>]*\balt=)[^>]*>/i);

    if (html.includes("data-ambient-audio")) {
      const audio = html.match(/<audio\b[^>]*>[\s\S]*?<\/audio>/i)?.[0];
      assert.ok(audio, "Missing optional audio element in " + file);
      assert.match(audio, /\bpreload="none"/i);
      assert.doesNotMatch(audio, /\bsrc\s*=|<source\b/i);
      assert.match(html, /<noscript>/i);
    }
  }
});

test("project records state real facts and link only to verified sources", () => {
  const slugs = ["zotero-wallpaper", "zontex", "score-calculator"];

  for (const slug of slugs) {
    const html = readFileSync(join(dist, "works", slug, "index.html"), "utf8");
    const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
    assert.ok(main, "Missing project main content in " + slug);

    // A record that still says TODO in its body or its summary is not a
    // record. Placeholder wording belongs to unwritten entries only.
    assert.doesNotMatch(main, /TODO/, "Unresolved placeholder in " + slug);
    assert.doesNotMatch(main, /Project record is being assembled/);
    assert.doesNotMatch(
      html,
      /<meta[^>]*(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*content=["'][^"']*TODO/i,
    );

    // Outbound links must point somewhere the record actually came from, so a
    // fabricated repository or demo URL cannot slip in unnoticed.
    for (const [, href] of main.matchAll(/<a[^>]*href="(https?:\/\/[^"]+)"/gi)) {
      assert.match(
        href,
        /^https:\/\/(?:github\.com\/endoretic\/|endoretic\.cc\/)/,
        "Unverified outbound link in " + slug + ": " + href,
      );
    }
  }
});

test("the 404 page is not indexed or advertised as a canonical record", () => {
  const html = readFileSync(join(dist, "404.html"), "utf8");

  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.doesNotMatch(html, /rel="canonical"/);
  assert.doesNotMatch(html, /property="og:url"/);
});

test("production output contains no remote media or font requests", () => {
  for (const file of collectHtml(dist)) {
    const html = readFileSync(file, "utf8");
    assert.doesNotMatch(
      html,
      /<(?:img|audio|video|source|script|iframe|embed|object)\b[^>]*(?:src|srcset|poster|data)=["'](?:https?:)?\/\//i,
    );
    assert.doesNotMatch(
      html,
      /\b(?:src|srcset|poster)=["']data:(?:image|audio|video|font)\//i,
    );
    assert.doesNotMatch(
      html,
      /<link\b[^>]*rel=["'](?:stylesheet|preload)["'][^>]*href=["']https?:/i,
    );
  }

  const cssDirectory = join(dist, "_astro");
  if (existsSync(cssDirectory)) {
    for (const file of readdirSync(cssDirectory)) {
      if (file.endsWith(".css")) {
        const css = readFileSync(join(cssDirectory, file), "utf8");
        assert.doesNotMatch(css, /(?:url|@import)\s*\(\s*["']?https?:/i);
        assert.doesNotMatch(css, /url\(\s*["']?data:(?:image|audio|video|font)\//i);

        // Web fonts are allowed, but only from this origin. The Hymmnos glyph
        // face is the one @font-face on the site; a remote or inlined source
        // would be a rights and privacy regression, not a styling detail.
        for (const [, block] of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
          for (const [, source] of block.matchAll(/url\(\s*["']?([^"')]+)/gi)) {
            assert.match(
              source,
              /^\/[^/]/,
              "Font source must be a root-relative local path: " + source,
            );
          }
        }
      }
    }
  }
});
