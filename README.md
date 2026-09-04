# endoretic.cc

A static personal archive built with Astro and TypeScript.

This repository contains the static Astro foundation, its first visual system,
and a deliberately small set of self-hosted, rights-verified media.
Biographical details, project descriptions, and published notes remain
owner-supplied TODOs.

## Requirements

- Node.js 22.12 or newer
- npm 9.6.5 or newer

The GitHub verification workflow uses Node.js 24.

## Install

Install the exact dependency versions recorded in the lockfile:

    npm ci

When intentionally changing dependencies, use npm and commit the updated
package-lock.json.

## Development

Start the local Astro server:

    npm run dev

Astro prints the local URL. Draft content is visible during local development
and is labelled as a draft where it appears.

The site uses no client-side JavaScript for its core navigation or content.
Small, progressively enhanced scripts are limited to optional hero motion,
ambient-audio controls, and the hidden language layer; the complete site remains
useful when JavaScript is unavailable.

## Build and validation

Validate the asset manifest and every active local media path:

    npm run assets:check

Run Astro's type and content checks:

    npm run check

Create the production output:

    npm run build

Verify the generated routes, draft exclusion, CNAME, semantic shell, licensed
media fallbacks, and no-remote-media baseline after building:

    npm test

Preview the generated site:

    npm run preview

Production output is written to dist/.

## Adding projects

Add a Markdown or MDX file to src/content/projects/. The schema is defined in
src/content.config.ts.

Required frontmatter:

    ---
    title: "Project title"
    summary: "Owner-supplied factual summary"
    lang: "en"
    draft: true
    ---

Supported language values are en and zh-CN. Optional fields include
placeholder, featured, status, year, tags, repo, demo, and coverAssetId.

New entries default to draft when draft is omitted. Draft projects are excluded
from production lists and routes. Zotero Wallpaper and Zontex use
placeholder: true with draft: false so their required public pages can state
honestly that details are still pending.

Do not infer descriptions, statuses, dates, links, or technologies. Keep
unknown values as specific [TODO] markers or omit optional fields.

## Adding notes

Add a Markdown or MDX file to src/content/notes/.

Required draft frontmatter:

    ---
    title: "[TODO: note title]"
    description: "[TODO: owner-supplied summary]"
    lang: "en"
    draft: true
    ---

A published note must set `draft: false` and provide both `publishedAt` (the
first publication date) and `updatedAt` (the latest content revision). Public
note cards and ordering use `publishedAt`; the note detail page labels and shows
`updatedAt` as `Last updated`. Optional fields include tags, readingMode, and
coverAssetId. Production builds exclude all draft notes from indexes and
generated detail routes.

## Interface language

Interface copy lives in `src/locales/en.json` and `hymmnos.json`, and is placed
in markup with `key()` and `t()` from `src/lib/i18n.ts` rather than written
inline. Both catalogs carry the same keys; `npm test` fails if they drift.

English is the interface language. The second catalog is Hymmnos, reached
through a switch hidden in the footer, which also swaps the script to a Hymmnos
glyph font and offers the Latin transliteration on hover or focus.

Interface language and content language are separate axes. Notes and projects
keep their own `lang` frontmatter, so a Chinese note still renders as
`<html lang="zh-CN">` inside the English interface.

The layer is applied in the browser. Pages are built and served in English,
nothing about the layer is fetched until a reader finds it, and no accessible
name, alt text, `<title>`, or metadata is ever translated — so navigation,
assistive technology, and search results are unaffected by it.

## Media policy

Every third-party asset must be registered in `src/data/assets.yml` before it
can appear on a production page. An active entry records its original source,
exact compatible license, display-ready attribution, verification and retrieval
dates, every local derivative, actual modifications, pages used, and rights
notes. Proposed entries are not production approvals and may not have local
files.

Run `npm run assets:check` before committing media. The check rejects missing
manifest fields, unapproved licenses, remote production paths, missing local
files, oversized hero video, and unregistered files under `public/media/`.
`npm run build` runs this gate automatically.

Approved derivatives live under stable IDs in `public/media/`. Responsive
AVIF and WebP files are pre-generated locally because Astro does not transform
files in `public/`; the source page and transformation record remain in the
manifest. Third-party production media uses `LicensedImage.astro`,
`LicensedVideo.astro`, and `AmbientAudio.astro` rather than raw media paths.
Repository-original generated art lives under `public/media/generated/` and may
be referenced directly; it must still be responsive, local, and documented in
the visual report. Remote fonts and remote media requests remain prohibited.

High-resolution working masters for repository-original art live under
`assets/source/generated/`. That directory is source storage, is not copied to
the static build, and uses the same stable ID as its production derivatives
with a `-source.png` suffix. Export only the responsive files actually used by
the site into `public/media/generated/`.

The retained generated source set currently covers `hero-afterlight-01`, the
four `scene-*-01` vignettes, both `foreground-*-01` artifacts, and the three
unused `record-art-*-01` studies. The foreground generator outputs contain a
baked checkerboard; they are retained as upstream inputs, while their deployed
derivatives use the documented background extraction. The record-art sources
are the later manually extracted RGBA masters, not duplicate generator
intermediates.

User-supplied photographic inputs are retained separately under
`assets/source/original/`. The current `spine-city-viaduct-source.jpg` input and
its canonical `spine-archive-study-01-source.png` stylized master are cleared
for this project by the site owner's confirmed authorization and contract. Its
responsive AVIF/WebP exports are used by the first published note,
`/notes/liuzhou-pingshan-bridge/`.

## Optional ambience

The single ambient track is a secondary preserved-memory or transmission
layer. The site keeps its full identity when silent. Playback is off by default,
uses `preload="none"`, begins only after an explicit user gesture, and pauses
when the document is hidden. Plain-language play/pause, mute, and volume
controls are keyboard accessible. Only the listener's volume and mute choices
are remembered; a prior play action never becomes autoplay.

Commercial soundtracks, rips, unknown licenses, NC, ND, and unreviewed SA
remain blocked. Reduced-motion mode keeps all audio UI static.

## Deployment

.github/workflows/deploy.yml builds the Astro artifact and publishes dist/ to
GitHub Pages on every push to main. It re-runs npm run build and npm test
before uploading, and fails the build if dist/CNAME does not match
public/CNAME, so a deployment cannot silently drop the custom domain.

public/CNAME is copied into the Astro artifact and contains:

    endoretic.cc

The workflow only publishes once Pages Source is set to GitHub Actions in
repository settings. That setting is not code and must be changed by hand.

.github/workflows/verify.yml remains validation-only. It has no Pages write
permission and uploads no artifact.

### Verified hosting facts

- This repository had no published Pages site. Both endoretic.github.io and
  endoretic.cc returned GitHub's "Site not found" page, which is why every
  path 404ed regardless of what was pushed.
- The two project subpaths are published by their own repositories, not by
  this one. endoretic.github.io/pjsk-tier-maker/ serves normally from
  endoretic/pjsk-tier-maker.
- Project sites are reachable under endoretic.cc/<repo>/ only while this user
  site claims endoretic.cc as its custom domain. Those subpaths are currently
  404 at the apex for that reason, and publishing this site restores them.
- DNS is already correct: endoretic.cc resolves to GitHub Pages' apex
  addresses (185.199.108-111.153), unproxied.
- The Astro site publishes its own project pages under /works/<slug>/, so it
  does not collide with the root-level /pjsk-tier-maker/ and
  /score-calculator/ subpaths.

### Enabling the deployment

1. Set Settings > Pages > Source to GitHub Actions.
2. Push to main, or run the Deploy to GitHub Pages workflow manually.
3. Set the custom domain to endoretic.cc and enable Enforce HTTPS once the
   first deployment succeeds.
4. Confirm /, /works/, /pjsk-tier-maker/, and /score-calculator/.

Cloudflare remains an external DNS concern. Do not change Cloudflare DNS,
proxy, or SSL/TLS settings as part of a site-code deployment.

To roll back, disable or revert deploy.yml and return Pages Source to a
branch. The tracked root index.html and root CNAME are preserved as that
fallback. DNS should not be changed for this rollback.

## Remaining content TODOs

- Owner-approved public name, introduction, interests, and contact links
- Factual descriptions, statuses, links, and technical details for Zotero
  Wallpaper and Zontex
- Decision on how pjsk-tier-maker and score-calculator should appear in Works
- Owner-written notes and publication metadata
- Editorial assignments for the three quarantined note-cover candidates; no
  cover is downloaded until a published note provides a truthful `used_on`
  destination
