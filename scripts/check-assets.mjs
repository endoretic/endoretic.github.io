#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";

const MEBIBYTE = 1024 * 1024;
const HERO_VIDEO_TARGET_BYTES = 3 * MEBIBYTE;
const HERO_VIDEO_MAX_BYTES = 6 * MEBIBYTE;

const allowedStatuses = new Set(["proposed", "active"]);
const allowedKinds = new Set(["image", "video", "audio"]);
const requiredFields = [
  "id",
  "status",
  "kind",
  "title",
  "creator",
  "source_page",
  "original_file",
  "license",
  "license_url",
  "attribution",
  "rights_verified_on",
  "retrieved_on",
  "local_files",
  "modifications",
  "used_on",
  "notes",
];

const fileExtensionsByKind = {
  image: new Set([".avif", ".jpeg", ".jpg", ".png", ".svg", ".webp"]),
  video: new Set([".mp4", ".webm"]),
  audio: new Set([".m4a", ".mp3", ".ogg", ".opus", ".wav"]),
};

const licenseRules = new Map([
  ["cc0 1.0", { category: "cc0", path: "/publicdomain/zero/1.0" }],
  ["cc0-1.0", { category: "cc0", path: "/publicdomain/zero/1.0" }],
  [
    "public domain mark 1.0",
    { category: "public-domain-mark", path: "/publicdomain/mark/1.0" },
  ],
  ["public domain", { category: "public-domain" }],
  ["clearly stated public domain", { category: "public-domain" }],
  ["cc by 4.0", { category: "cc-by", path: "/licenses/by/4.0" }],
  ["cc-by-4.0", { category: "cc-by", path: "/licenses/by/4.0" }],
  ["pexels license", { category: "pexels", host: "pexels.com" }],
  ["unsplash license", { category: "unsplash", host: "unsplash.com" }],
  ["coverr license", { category: "coverr", host: "coverr.co" }],
  [
    "u.s. government work; nasa images and media usage guidelines",
    { category: "nasa", host: "nasa.gov" },
  ],
  [
    "nasa-owned u.s. government work; nasa images and media usage guidelines",
    { category: "nasa", host: "nasa.gov" },
  ],
]);

// The owner explicitly requested original anime illustrations for this review
// on 2026-09-07. These two scoped quotations retain their copyright status;
// they are not reusable stock assets or additions to the licence allowlist.
const editorialImageQuotations = new Map([
  ["lost-universe-key-visual-01", {
    page: "https://enoki-films.co.jp/pro_lostuniverse.php",
    file: "https://enoki-films.co.jp/images/proinfo/lostuniverse.png",
  }],
  ["lost-universe-finale-01", {
    page: "https://www.b-ch.com/titles/2915/026",
    file: "https://image2.b-ch.com/ttl2/2915/2915026a.jpg?impolicy=fitin&ww=960&hh=540",
  }],
]);

function isReviewedEditorialQuotation(entry) {
  const quotation = editorialImageQuotations.get(entry.id);
  return quotation !== undefined &&
    entry.kind === "image" &&
    entry.license === "Copyrighted; editorial quotation" &&
    entry.source_page === quotation.page &&
    entry.original_file === quotation.file &&
    entry.license_url === quotation.page &&
    Array.isArray(entry.used_on) &&
    entry.used_on.length === 1 &&
    entry.used_on[0] === "/notes/computers-go-to-heaven/";
}

function normalizeLicense(value) {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function entryLabel(entry, index) {
  return isNonEmptyString(entry?.id) ? entry.id : `entry #${index + 1}`;
}

function hasOwn(object, field) {
  return Object.prototype.hasOwnProperty.call(object, field);
}

function parseHttpsUrl(value) {
  if (!isNonEmptyString(value)) return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username.length > 0 ||
      url.password.length > 0
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function hostMatches(url, expectedHost) {
  return (
    url.hostname === expectedHost || url.hostname.endsWith(`.${expectedHost}`)
  );
}

function pathMatches(url, expectedPath) {
  return url.pathname.replace(/\/$/, "") === expectedPath;
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().startsWith(value);
}

function collectFiles(directory) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(path) : [path];
  });
}

function creditsReadManifest(repositoryRoot) {
  const creditsPath = join(repositoryRoot, "src", "pages", "credits.astro");
  if (!existsSync(creditsPath)) return false;

  const sourceRoot = join(repositoryRoot, "src");
  const sourceFiles = collectFiles(sourceRoot).filter((file) =>
    new Set([".astro", ".js", ".mjs", ".ts"]).has(extname(file)),
  );
  const byResolvedPath = new Map(sourceFiles.map((file) => [resolve(file), file]));
  const pending = [resolve(creditsPath)];
  const visited = new Set();

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || visited.has(file) || !existsSync(file)) continue;
    visited.add(file);

    const source = readFileSync(file, "utf8");
    if (/assets\.ya?ml(?:\?raw)?["'`]/i.test(source)) return true;

    for (const match of source.matchAll(
      /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    )) {
      const specifier = match[1]?.split("?", 1)[0];
      if (!specifier?.startsWith(".")) continue;

      const base = resolve(dirname(file), specifier);
      const candidates = [
        base,
        `${base}.astro`,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.ts`,
        join(base, "index.astro"),
        join(base, "index.js"),
        join(base, "index.mjs"),
        join(base, "index.ts"),
      ];

      for (const candidate of candidates) {
        const resolvedCandidate = resolve(candidate);
        if (byResolvedPath.has(resolvedCandidate)) {
          pending.push(resolvedCandidate);
          break;
        }
      }
    }
  }

  return false;
}

function validateLocalPath(localPath, context) {
  const { id, kind, publicMediaRoot, publicRoot, errors } = context;

  if (!isNonEmptyString(localPath)) {
    errors.push(`[${id}] local_files entries must be non-empty strings.`);
    return null;
  }

  if (
    localPath.includes("\\") ||
    /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(localPath) ||
    !localPath.startsWith("/media/")
  ) {
    errors.push(
      `[${id}] local file "${localPath}" must be a root-relative /media/ path, not a remote URL or filesystem path.`,
    );
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(localPath);
  } catch {
    errors.push(`[${id}] local file "${localPath}" has invalid URL encoding.`);
    return null;
  }

  if (
    decodedPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    errors.push(`[${id}] local file "${localPath}" contains path traversal.`);
    return null;
  }

  const absolutePath = resolve(publicRoot, decodedPath.slice(1));
  if (
    absolutePath !== publicMediaRoot &&
    !absolutePath.startsWith(`${publicMediaRoot}${sep}`)
  ) {
    errors.push(`[${id}] local file "${localPath}" escapes public/media/.`);
    return null;
  }

  const allowedExtensions = fileExtensionsByKind[kind];
  const extension = extname(absolutePath).toLowerCase();
  if (allowedExtensions && !allowedExtensions.has(extension)) {
    errors.push(
      `[${id}] local file "${localPath}" has extension "${extension || "(none)"}", which is not valid for kind "${kind}".`,
    );
  }

  return absolutePath;
}

export function validateAssets(entries, options = {}) {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? dirname(dirname(fileURLToPath(import.meta.url))),
  );
  const publicRoot = join(repositoryRoot, "public");
  const publicMediaRoot = resolve(publicRoot, "media");
  const errors = [];
  const warnings = [];
  const ids = new Map();
  const localPathOwners = new Map();
  const registeredLocalPaths = new Set();

  if (!Array.isArray(entries)) {
    return {
      errors: ["[manifest] src/data/assets.yml must contain a top-level list."],
      warnings,
      counts: { active: 0, proposed: 0, total: 0 },
    };
  }

  let activeCount = 0;
  let proposedCount = 0;

  entries.forEach((entry, index) => {
    const id = entryLabel(entry, index);
    if (!isPlainObject(entry)) {
      errors.push(`[${id}] asset entry must be a mapping/object.`);
      return;
    }

    for (const field of requiredFields) {
      if (!hasOwn(entry, field)) {
        errors.push(`[${id}] missing required field "${field}".`);
      }
    }

    if (!isNonEmptyString(entry.id)) {
      errors.push(`[${id}] field "id" must be a non-empty string.`);
    } else {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id)) {
        errors.push(
          `[${id}] id must use stable lowercase kebab-case characters only.`,
        );
      }
      if (ids.has(entry.id)) {
        errors.push(
          `[${id}] duplicate id; first declared at entry #${ids.get(entry.id) + 1}.`,
        );
      } else {
        ids.set(entry.id, index);
      }
    }

    if (!allowedStatuses.has(entry.status)) {
      errors.push(
        `[${id}] status must be "proposed" or "active"; received ${JSON.stringify(entry.status)}.`,
      );
    }
    if (!allowedKinds.has(entry.kind)) {
      errors.push(
        `[${id}] kind must be image, video, or audio; received ${JSON.stringify(entry.kind)}.`,
      );
    }

    for (const field of ["title", "creator", "attribution", "notes"]) {
      if (!isNonEmptyString(entry[field])) {
        errors.push(`[${id}] field "${field}" must be a non-empty string.`);
      }
    }

    const sourcePage = parseHttpsUrl(entry.source_page);
    const originalFile = parseHttpsUrl(entry.original_file);
    const licenseUrl = parseHttpsUrl(entry.license_url);
    if (!sourcePage) {
      errors.push(`[${id}] source_page must be a valid public HTTPS URL.`);
    }
    if (!originalFile) {
      errors.push(`[${id}] original_file must be a valid public HTTPS URL.`);
    }
    if (!licenseUrl) {
      errors.push(`[${id}] license_url must be a valid public HTTPS URL.`);
    }

    if (!isIsoDate(entry.rights_verified_on)) {
      errors.push(
        `[${id}] rights_verified_on must be a real ISO date (YYYY-MM-DD).`,
      );
    }

    const normalizedLicense = isNonEmptyString(entry.license)
      ? normalizeLicense(entry.license)
      : "";
    const licenseRule = licenseRules.get(normalizedLicense);
    if (!licenseRule && !isReviewedEditorialQuotation(entry)) {
      errors.push(
        `[${id}] license ${JSON.stringify(entry.license)} is not on the first-release allowlist.`,
      );
    } else if (licenseRule && licenseUrl) {
      if (
        licenseRule.host &&
        !hostMatches(licenseUrl, licenseRule.host)
      ) {
        errors.push(
          `[${id}] license_url must point to the official ${licenseRule.host} license/guidelines page.`,
        );
      }
      if (
        licenseRule.path &&
        (!hostMatches(licenseUrl, "creativecommons.org") ||
          !pathMatches(licenseUrl, licenseRule.path))
      ) {
        errors.push(
          `[${id}] license_url does not match the exact ${entry.license} deed.`,
        );
      }
    }

    if (licenseRule?.category === "cc-by") {
      for (const field of [
        "creator",
        "source_page",
        "license_url",
        "attribution",
      ]) {
        if (!isNonEmptyString(entry[field])) {
          errors.push(
            `[${id}] CC BY 4.0 requires a display-ready "${field}" field.`,
          );
        }
      }
    }

    if (licenseRule?.category === "nasa") {
      if (!sourcePage || !hostMatches(sourcePage, "nasa.gov")) {
        errors.push(`[${id}] NASA media source_page must be on nasa.gov.`);
      }
      if (!/(?:nasa|naca)/i.test(entry.creator ?? "")) {
        errors.push(
          `[${id}] NASA media creator must identify NASA/NACA or the responsible NASA center.`,
        );
      }
      if (!/(?:nasa|naca)/i.test(entry.attribution ?? "")) {
        errors.push(
          `[${id}] NASA media attribution must visibly acknowledge NASA/NACA.`,
        );
      }
      const nasaRightsReview =
        entry.status === "active" ? entry.rights_notes : entry.notes;
      if (
        !/(?:endorsement|insignia|logo|person|people|third[- ]party|mark|ownership)/i.test(
          nasaRightsReview ?? "",
        )
      ) {
        errors.push(
          `[${id}] NASA rights notes must record a logo/person/third-party/endorsement risk review.`,
        );
      }
    }

    for (const field of ["local_files", "modifications", "used_on"]) {
      if (!Array.isArray(entry[field])) {
        errors.push(`[${id}] field "${field}" must be a list.`);
      }
    }

    const localFiles = Array.isArray(entry.local_files)
      ? entry.local_files
      : [];
    const modifications = Array.isArray(entry.modifications)
      ? entry.modifications
      : [];
    const usedOn = Array.isArray(entry.used_on) ? entry.used_on : [];

    if (entry.status === "proposed") {
      proposedCount += 1;
      if (
        entry.retrieved_on !== null &&
        entry.retrieved_on !== undefined &&
        entry.retrieved_on !== ""
      ) {
        errors.push(
          `[${id}] proposed asset cannot set retrieved_on; mark it active only after the production gate is complete.`,
        );
      }
      if (localFiles.length > 0 || modifications.length > 0 || usedOn.length > 0) {
        errors.push(
          `[${id}] proposed asset cannot contain local_files, modifications, or used_on production data.`,
        );
      }
    }

    if (entry.status === "active") {
      activeCount += 1;
      if (!isIsoDate(entry.retrieved_on)) {
        errors.push(
          `[${id}] active asset retrieved_on must be a real ISO date (YYYY-MM-DD).`,
        );
      }
      if (localFiles.length === 0) {
        errors.push(`[${id}] active asset must list at least one local file.`);
      }
      if (modifications.length === 0) {
        errors.push(
          `[${id}] active asset must describe modifications, or explicitly state that none were made.`,
        );
      }
      if (usedOn.length === 0) {
        errors.push(`[${id}] active asset must list at least one page in used_on.`);
      }
      if (!isNonEmptyString(entry.rights_notes)) {
        errors.push(
          `[${id}] active asset must include non-empty rights_notes separate from general notes.`,
        );
      } else if (/\[TODO(?::[^\]]*)?\]/i.test(entry.rights_notes)) {
        errors.push(
          `[${id}] active production field "rights_notes" cannot contain [TODO].`,
        );
      }

      for (const [field, values] of [
        ["modifications", modifications],
        ["used_on", usedOn],
      ]) {
        values.forEach((value, valueIndex) => {
          if (!isNonEmptyString(value)) {
            errors.push(
              `[${id}] ${field}[${valueIndex}] must be a non-empty string.`,
            );
          } else if (/\[TODO(?::[^\]]*)?\]/i.test(value)) {
            errors.push(
              `[${id}] active production field ${field}[${valueIndex}] cannot contain ${value.match(/\[TODO[^\]]*\]/i)?.[0]}.`,
            );
          }
        });
      }

      for (const field of [
        "title",
        "creator",
        "source_page",
        "original_file",
        "license",
        "license_url",
        "attribution",
        "notes",
      ]) {
        if (typeof entry[field] === "string" && /\[TODO(?::[^\]]*)?\]/i.test(entry[field])) {
          errors.push(
            `[${id}] active production field "${field}" cannot contain [TODO].`,
          );
        }
      }
    } else if (
      entry.retrieved_on !== null &&
      entry.retrieved_on !== undefined &&
      entry.retrieved_on !== "" &&
      !isIsoDate(entry.retrieved_on)
    ) {
      errors.push(`[${id}] retrieved_on must be null or a real ISO date.`);
    }

    localFiles.forEach((localPath) => {
      const absolutePath = validateLocalPath(localPath, {
        id,
        kind: entry.kind,
        publicMediaRoot,
        publicRoot,
        errors,
      });
      if (!absolutePath) return;

      const canonicalPath = absolutePath.toLowerCase();
      registeredLocalPaths.add(canonicalPath);
      if (localPathOwners.has(canonicalPath)) {
        errors.push(
          `[${id}] local file "${localPath}" is already claimed by asset "${localPathOwners.get(canonicalPath)}".`,
        );
      } else {
        localPathOwners.set(canonicalPath, id);
      }

      if (entry.status !== "active") return;
      if (!existsSync(absolutePath)) {
        errors.push(`[${id}] local file "${localPath}" does not exist.`);
        return;
      }

      const fileStats = statSync(absolutePath);
      if (!fileStats.isFile()) {
        errors.push(`[${id}] local path "${localPath}" is not a file.`);
        return;
      }
      if (fileStats.size === 0) {
        errors.push(`[${id}] local file "${localPath}" is empty.`);
      }

      if (entry.kind === "video" && /(?:^|-)hero(?:-|$)/.test(entry.id)) {
        if (fileStats.size > HERO_VIDEO_MAX_BYTES) {
          errors.push(
            `[${id}] hero video "${localPath}" is ${(fileStats.size / MEBIBYTE).toFixed(2)} MiB; the hard maximum is 6 MiB.`,
          );
        } else if (fileStats.size > HERO_VIDEO_TARGET_BYTES) {
          warnings.push(
            `[${id}] hero video "${localPath}" is ${(fileStats.size / MEBIBYTE).toFixed(2)} MiB; the target is at most 3 MiB.`,
          );
        }
      }
    });

    usedOn.forEach((page, pageIndex) => {
      if (entry.status !== "active" || !isNonEmptyString(page)) return;
      if (!page.startsWith("/") || /^(?:[a-z][a-z\d+.-]*:)?\/\//i.test(page)) {
        errors.push(
          `[${id}] used_on[${pageIndex}] must be a root-relative site route.`,
        );
      }
    });
  });

  for (const file of collectFiles(publicMediaRoot)) {
    const relativeMediaPath = file
      .slice(publicMediaRoot.length + 1)
      .split(sep)
      .join("/");
    if (relativeMediaPath === "generated" || relativeMediaPath.startsWith("generated/")) {
      continue;
    }

    if (!registeredLocalPaths.has(resolve(file).toLowerCase())) {
      errors.push(
        `[manifest] unregistered media file "/media/${relativeMediaPath}"; add it to an active entry or remove it from public/media/.`,
      );
    }
  }

  if (activeCount === 0) {
    warnings.push(
      "[manifest] no active assets are integrated; only proposed candidates were checked.",
    );
  } else {
    const creditsPath = join(repositoryRoot, "src", "pages", "credits.astro");
    if (!existsSync(creditsPath)) {
      errors.push("[credits] missing src/pages/credits.astro.");
    } else {
      const creditsSource = readFileSync(creditsPath, "utf8");
      if (!creditsSource.includes("data-asset-manifest")) {
        errors.push(
          '[credits] credits page must expose the manifest-backed rendering signal `data-asset-manifest`.',
        );
      }
      if (!creditsReadManifest(repositoryRoot)) {
        errors.push(
          "[credits] credits page import graph does not read src/data/assets.yml.",
        );
      }
    }
  }

  return {
    errors,
    warnings,
    counts: {
      active: activeCount,
      proposed: proposedCount,
      total: entries.length,
    },
  };
}

export function parseManifest(source) {
  const document = parseDocument(source, {
    prettyErrors: true,
    uniqueKeys: true,
  });
  if (document.errors.length > 0) {
    throw new Error(document.errors.map((error) => error.message).join("\n"));
  }
  return document.toJS();
}

function run() {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const manifestPath = join(repositoryRoot, "src", "data", "assets.yml");

  if (!existsSync(manifestPath)) {
    console.error("Asset manifest check failed:\n- [manifest] missing src/data/assets.yml.");
    process.exitCode = 1;
    return;
  }

  let entries;
  try {
    entries = parseManifest(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    console.error(
      `Asset manifest check failed:\n- [manifest] invalid YAML: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
    return;
  }

  const result = validateAssets(entries, { repositoryRoot });
  for (const warning of result.warnings) {
    console.warn(`Asset warning: ${warning}`);
  }

  if (result.errors.length > 0) {
    console.error(
      `Asset manifest check failed with ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}:`,
    );
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Asset manifest check passed: ${result.counts.total} entries (${result.counts.active} active, ${result.counts.proposed} proposed).`,
  );
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) run();
