import { parse } from "yaml";

import manifestSource from "../data/assets.yml?raw";

export type AssetKind = "image" | "video" | "audio" | "font";
export type AssetStatus = "proposed" | "active";

export interface AssetManifestEntry {
  id: string;
  status: AssetStatus;
  kind: AssetKind;
  title: string;
  creator: string;
  source_page: string;
  original_file?: string | null;
  license: string;
  license_url: string;
  attribution: string;
  rights_verified_on?: string | null;
  retrieved_on: string | null;
  checksum?: string | null;
  local_files: string[];
  modifications: string[];
  used_on: string[];
  notes: string;
  rights_notes?: string;
}

export interface LocalMediaSource {
  path: string;
  mimeType: string;
}

export interface ResponsiveImageSource {
  path: string;
  width?: number;
}

export interface ResponsiveImageFiles {
  avif: ResponsiveImageSource[];
  webp: ResponsiveImageSource[];
  fallback: ResponsiveImageSource;
  fallbackMimeType: string;
}

const IMAGE_MIME_TYPES = {
  avif: "image/avif",
  webp: "image/webp",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
} as const;

const VIDEO_MIME_TYPES = {
  webm: "video/webm",
  mp4: "video/mp4",
} as const;

const AUDIO_MIME_TYPES = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/ogg; codecs=opus",
  m4a: "audio/mp4",
  wav: "audio/wav",
} as const;

const parsedManifest: unknown = parse(manifestSource);

if (!Array.isArray(parsedManifest)) {
  throw new Error("Asset manifest must contain a top-level YAML list.");
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const isAssetKind = (value: unknown): value is AssetKind =>
  value === "image" ||
  value === "video" ||
  value === "audio" ||
  value === "font";

const isAssetStatus = (value: unknown): value is AssetStatus =>
  value === "proposed" || value === "active";

function readManifestEntry(value: unknown, index: number): AssetManifestEntry {
  if (!value || typeof value !== "object") {
    throw new Error(`Asset manifest entry ${index + 1} must be an object.`);
  }

  const entry = value as Record<string, unknown>;
  const requiredStrings = [
    "id",
    "title",
    "creator",
    "source_page",
    "license",
    "license_url",
    "attribution",
    "notes",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof entry[field] !== "string" || entry[field].length === 0) {
      throw new Error(
        `Asset manifest entry ${index + 1} has no valid ${field}.`,
      );
    }
  }

  if (!isAssetKind(entry.kind)) {
    throw new Error(
      `Asset ${String(entry.id)} has unsupported kind ${String(entry.kind)}.`,
    );
  }

  if (!isAssetStatus(entry.status)) {
    throw new Error(
      `Asset ${String(entry.id)} has unsupported status ${String(entry.status)}.`,
    );
  }

  for (const field of ["local_files", "modifications", "used_on"] as const) {
    if (!isStringArray(entry[field])) {
      throw new Error(`Asset ${String(entry.id)} has no valid ${field} list.`);
    }
  }

  return entry as unknown as AssetManifestEntry;
}

export const assetManifest = Object.freeze(
  parsedManifest.map(readManifestEntry),
) as readonly AssetManifestEntry[];

const assetsById = new Map(assetManifest.map((asset) => [asset.id, asset]));

if (assetsById.size !== assetManifest.length) {
  throw new Error("Asset manifest IDs must be unique.");
}

function assertLocalMediaPath(assetId: string, path: string): void {
  if (
    !path.startsWith("/media/") ||
    path.includes("://") ||
    path.includes("\\") ||
    path.split("/").includes("..")
  ) {
    throw new Error(
      `Asset ${assetId} contains a non-local media path: ${path}`,
    );
  }
}

function getExtension(path: string): string {
  return path.split("?")[0]?.split(".").pop()?.toLowerCase() ?? "";
}

function getDeclaredWidth(path: string): number | undefined {
  const match = path.match(/-(\d{2,5})(?:w)?\.[^.]+$/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

function sortByWidth(
  left: ResponsiveImageSource,
  right: ResponsiveImageSource,
): number {
  return (left.width ?? Number.MAX_SAFE_INTEGER) -
    (right.width ?? Number.MAX_SAFE_INTEGER);
}

export function getAsset(
  assetId: string,
  expectedKind?: AssetKind,
): AssetManifestEntry {
  const asset = assetsById.get(assetId);

  if (!asset) {
    throw new Error(`Unknown asset ID: ${assetId}`);
  }

  if (expectedKind && asset.kind !== expectedKind) {
    throw new Error(
      `Asset ${assetId} is ${asset.kind}, not the expected ${expectedKind}.`,
    );
  }

  if (asset.status !== "active") {
    throw new Error(`Asset ${assetId} is not active for production use.`);
  }

  if (asset.local_files.length === 0) {
    throw new Error(`Asset ${assetId} has no integrated local files.`);
  }

  for (const path of asset.local_files) {
    assertLocalMediaPath(assetId, path);
  }

  return asset;
}

export function getIntegratedAssets(
  kind?: AssetKind,
): readonly AssetManifestEntry[] {
  return assetManifest.filter(
    (asset) =>
      asset.status === "active" &&
      asset.local_files.length > 0 &&
      (kind === undefined || asset.kind === kind),
  );
}

export function getResponsiveImageFiles(assetId: string): ResponsiveImageFiles {
  const asset = getAsset(assetId, "image");
  const images = asset.local_files
    .map((path) => ({
      path,
      extension: getExtension(path),
      width: getDeclaredWidth(path),
    }))
    .filter(
      (file) => file.extension in IMAGE_MIME_TYPES,
    );

  const avif = images
    .filter((file) => file.extension === "avif")
    .map(({ path, width }) => ({ path, width }))
    .sort(sortByWidth);
  const webp = images
    .filter((file) => file.extension === "webp")
    .map(({ path, width }) => ({ path, width }))
    .sort(sortByWidth);
  const fallbackFile =
    images.find((file) => file.extension === "jpg") ??
    images.find((file) => file.extension === "jpeg") ??
    images.find((file) => file.extension === "png") ??
    images.find((file) => file.extension === "webp") ??
    images.find((file) => file.extension === "avif");

  if (!fallbackFile) {
    throw new Error(`Image asset ${assetId} has no supported local image file.`);
  }

  return {
    avif,
    webp,
    fallback: {
      path: fallbackFile.path,
      width: fallbackFile.width,
    },
    fallbackMimeType:
      IMAGE_MIME_TYPES[
        fallbackFile.extension as keyof typeof IMAGE_MIME_TYPES
      ],
  };
}

function getLocalSources<T extends Record<string, string>>(
  assetId: string,
  expectedKind: AssetKind,
  mimeTypes: T,
): LocalMediaSource[] {
  const asset = getAsset(assetId, expectedKind);
  const sources = asset.local_files.flatMap((path) => {
    const extension = getExtension(path) as keyof T;
    const mimeType = mimeTypes[extension];

    return mimeType ? [{ path, mimeType }] : [];
  });

  if (sources.length === 0) {
    throw new Error(
      `Asset ${assetId} has no supported local ${expectedKind} source.`,
    );
  }

  return sources;
}

export function getVideoSources(assetId: string): LocalMediaSource[] {
  const sources = getLocalSources(
    assetId,
    "video",
    VIDEO_MIME_TYPES,
  );
  const order = ["video/webm", "video/mp4"];

  return sources.sort(
    (left, right) =>
      order.indexOf(left.mimeType) - order.indexOf(right.mimeType),
  );
}

export function getAudioSources(assetId: string): LocalMediaSource[] {
  return getLocalSources(assetId, "audio", AUDIO_MIME_TYPES);
}

export function toSrcSet(sources: ResponsiveImageSource[]): string | undefined {
  if (sources.length === 0) {
    return undefined;
  }

  return sources
    .map((source) =>
      source.width ? `${source.path} ${source.width}w` : source.path,
    )
    .join(", ");
}
