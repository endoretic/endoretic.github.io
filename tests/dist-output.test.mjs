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

test("project placeholders are explicit and contain no invented links", () => {
  for (const slug of ["zotero-wallpaper", "zontex"]) {
    const html = readFileSync(
      join(dist, "works", slug, "index.html"),
      "utf8",
    );

    assert.match(html, /Project record is being assembled/);
    assert.match(html, /TODO: owner-supplied factual description/);
    assert.doesNotMatch(
      html,
      /<meta\b[^>]*(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*content=["'][^"']*TODO/i,
    );
    const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
    assert.ok(main, "Missing project main content");
    assert.doesNotMatch(main, /<a\b[^>]*href="https?:\/\//i);
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
        assert.doesNotMatch(css, /@font-face/i);
      }
    }
  }
});
