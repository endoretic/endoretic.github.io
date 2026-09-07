import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parse } from "yaml";

import { validateAssets } from "../scripts/check-assets.mjs";

function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), "endoretic-assets-check-"));
  mkdirSync(join(root, "public", "media", "video"), { recursive: true });
  mkdirSync(join(root, "src", "data"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  mkdirSync(join(root, "src", "pages"), { recursive: true });
  writeFileSync(
    join(root, "src", "pages", "credits.astro"),
    '---\nimport { assets } from "../lib/assets";\n---\n<section data-asset-manifest>{assets.length}</section>\n',
  );
  writeFileSync(
    join(root, "src", "lib", "assets.ts"),
    'import manifest from "../data/assets.yml?raw";\nexport const assets = manifest;\n',
  );
  return root;
}

function baseAsset(overrides = {}) {
  return {
    id: "hero-radio-array-01",
    status: "active",
    kind: "video",
    title: "Satellite Antennas in a Grassland",
    creator: "Matthias Groeneveld",
    source_page:
      "https://www.pexels.com/video/satellite-antennas-in-a-grassland-6420489/",
    original_file:
      "https://videos.pexels.com/video-files/6420489/source.mp4",
    license: "Pexels License",
    license_url: "https://www.pexels.com/license/",
    attribution: "Satellite Antennas in a Grassland by Matthias Groeneveld via Pexels.",
    rights_verified_on: "2026-09-03",
    retrieved_on: "2026-09-03",
    local_files: ["/media/video/hero-radio-array-01.mp4"],
    modifications: ["Audio removed; transcoded to MP4."],
    used_on: ["/"],
    notes: "No visible person, logo, artwork, or readable sign.",
    rights_notes:
      "No visible person, logo, trademark, artwork, or readable sign; no endorsement is implied.",
    ...overrides,
  };
}

test("asset checker accepts a complete active manifest entry", (t) => {
  const root = makeRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "public", "media", "video", "hero-radio-array-01.mp4"),
    "media",
  );

  const result = validateAssets([baseAsset()], { repositoryRoot: root });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});

test("editorial anime quotations stay limited to their reviewed source and article", () => {
  const repositoryRoot = new URL("../", import.meta.url);
  const assets = parse(readFileSync(new URL("src/data/assets.yml", repositoryRoot), "utf8"));
  const quotations = assets.filter((asset) => asset.license === "Copyrighted; editorial quotation");
  assert.equal(quotations.length, 2);
  for (const asset of quotations) {
    const check = (entry) => validateAssets([entry]).errors
      .filter((error) => error.includes("not on the first-release allowlist"));
    assert.deepEqual(check(asset), []);
    for (const change of [
      { id: "unreviewed-anime-image" },
      { kind: "video" },
      { source_page: "https://example.com/unreviewed-image" },
      { original_file: "https://example.com/different-image.jpg" },
      { used_on: ["/"] },
      { used_on: [...asset.used_on, "/about/"] },
    ]) {
      assert.equal(check({ ...asset, ...change }).length, 1);
    }
  }
});

test("asset checker blocks proposed entries that masquerade as active", (t) => {
  const root = makeRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const asset = baseAsset({
    status: "proposed",
    license: "unknown",
    license_url: "https://example.com/unknown",
  });

  const result = validateAssets([asset], { repositoryRoot: root });
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("[hero-radio-array-01]") &&
        error.includes("not on the first-release allowlist"),
    ),
  );
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("[hero-radio-array-01]") &&
        error.includes("proposed asset cannot contain local_files"),
    ),
  );
});

test("asset checker blocks traversal and hero video files above 6 MiB", (t) => {
  const root = makeRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const videoPath = join(
    root,
    "public",
    "media",
    "video",
    "hero-radio-array-01.mp4",
  );
  writeFileSync(videoPath, "x");
  truncateSync(videoPath, 6 * 1024 * 1024 + 1);

  const result = validateAssets(
    [
      baseAsset({
        local_files: [
          "/media/video/hero-radio-array-01.mp4",
          "/media/video/../outside.mp4",
        ],
      }),
    ],
    { repositoryRoot: root },
  );

  assert.ok(result.errors.some((error) => error.includes("hard maximum is 6 MiB")));
  assert.ok(result.errors.some((error) => error.includes("contains path traversal")));
});

test("asset checker requires rights notes and rejects unregistered media", (t) => {
  const root = makeRepository();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "public", "media", "video", "hero-radio-array-01.mp4"),
    "media",
  );
  writeFileSync(
    join(root, "public", "media", "video", "unregistered.mp4"),
    "media",
  );

  const result = validateAssets(
    [baseAsset({ rights_notes: "[TODO: complete review]" })],
    { repositoryRoot: root },
  );

  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("[hero-radio-array-01]") &&
        error.includes('"rights_notes" cannot contain [TODO]'),
    ),
  );
  assert.ok(
    result.errors.some(
      (error) =>
        error.includes("[manifest]") && error.includes("unregistered.mp4"),
    ),
  );
});
