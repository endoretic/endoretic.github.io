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

test("interface text keeps WCAG AA across the pale display surfaces", () => {
  const grounds = [
    token("--surface-0"),
    token("--surface-1"),
    token("--surface-2"),
  ];
  const texts = ["--ink-950", "--ink-800", "--ink-650", "--ink-500"];

  for (const ground of grounds) {
    for (const name of texts) {
      const ratio = contrast(token(name), ground);
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

test("the oxidised signal remains readable on every pale surface", () => {
  for (const ground of ["--surface-0", "--surface-1", "--surface-2"]) {
    const ratio = contrast(token("--signal-500"), token(ground));
    assert.ok(ratio >= 4.5, `--signal-500 on ${ground} is ${ratio.toFixed(2)}:1`);
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
