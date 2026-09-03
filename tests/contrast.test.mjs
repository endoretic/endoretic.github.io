import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = readFileSync(
  join(repositoryRoot, "src/styles/tokens.css"),
  "utf8",
);
const globalCss = readFileSync(
  join(repositoryRoot, "src/styles/global.css"),
  "utf8",
);

const channel = (value) => {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16),
];
const composite = (base, layer, alpha) =>
  base.map((value, index) => value + alpha * (layer[index] - value));

const declaration = (name) => {
  const line = tokens
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().startsWith(name + ":"));
  assert.ok(line, "Missing token " + name);
  return line.slice(line.indexOf(":") + 1).trim();
};

const token = (name) => {
  const value = declaration(name);
  assert.ok(value.startsWith("#"), name + " should be a hex colour");
  return hex(value.slice(0, 7));
};

const alphaOf = (name) => {
  const value = declaration(name);
  const slash = value.lastIndexOf("/");
  assert.ok(slash !== -1, name + " should carry an alpha channel");
  const alpha = Number.parseFloat(value.slice(slash + 1));
  assert.ok(
    Number.isFinite(alpha) && alpha >= 0 && alpha <= 1,
    name + " has an unreadable alpha",
  );
  return alpha;
};

/*
 * The page ground is a stack of translucent warm and cool light over a dark
 * gradient, and muted body copy sits directly on it. A glow layer added for
 * atmosphere once pushed muted text to 2.2:1, so the alpha of these layers is
 * bounded by contrast rather than by taste.
 *
 * This composites every layer at full strength over each stop of the base
 * gradient, which is stricter than what the page actually renders, since the
 * radial layers peak in different places and never all reach full strength at
 * one point. Passing here means the real page has margin in hand.
 */
test("muted text keeps WCAG AA over the page atmosphere", () => {
  const violet = Number.parseFloat(
    globalCss.match(/rgb\(63 63 104 \/ ([\d.]+)\)/)?.[1] ?? "1",
  );
  const grounds = [
    token("--carbon-975"),
    token("--indigo-700"),
    hex("#181a30"),
    token("--carbon-925"),
  ];
  const texts = ["--ash-500", "--bone-300", "--bone-200", "--bone-100"];

  for (const ground of grounds) {
    let background = composite(ground, [63, 63, 104], violet);
    background = composite(background, [198, 132, 106], alphaOf("--glow-warm"));
    background = composite(background, [122, 152, 176], alphaOf("--glow-cool"));

    for (const name of texts) {
      const ratio = contrast(token(name), background);
      assert.ok(
        ratio >= 4.5,
        name +
          " on the composited ground is " +
          ratio.toFixed(2) +
          ":1, below AA",
      );
    }
  }
});

/*
 * A warm band fixed to the bottom of the viewport sits under the footer and
 * the end of every page, which is where the earlier contrast failure came
 * from. Atmosphere belongs in the body gradient, where the test above bounds
 * it.
 */
test("no fixed full-viewport glow layer sits under page text", () => {
  assert.doesNotMatch(globalCss, /body::after\s*\{[^}]*position:\s*fixed/);
});
