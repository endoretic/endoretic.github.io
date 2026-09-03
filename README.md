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
Small, progressively enhanced scripts are limited to optional hero motion and
ambient-audio controls; the complete site remains useful when JavaScript is
unavailable.

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

A published note must set draft: false and provide publishedAt. Optional fields
include updatedAt, tags, readingMode, and coverAssetId. Production builds
exclude all draft notes from indexes and generated detail routes.

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

The tracked root index.html and root CNAME are intentionally preserved as the
existing deployment fallback. [TODO: verify the exact GitHub Pages source
setting and the hosting mechanism for the two existing project subpaths.]

public/CNAME is copied into the Astro artifact and contains:

    endoretic.cc

.github/workflows/verify.yml is validation-only. It has no Pages write
permission, uploads no Pages artifact, and cannot replace the current
deployment. This is intentional until the existing Pages source and subpath
routing are verified.

Before enabling an artifact deployment:

1. Verify the Astro artifact locally and confirm dist/CNAME.
2. Confirm that /, /pjsk-tier-maker/, and /score-calculator/ still have a
   documented rollback path.
3. If Pages is branch-published, manually change Pages Source to GitHub
   Actions.
4. Add or enable the reviewed deploy workflow.
5. Verify the custom domain and HTTPS after deployment.

Cloudflare remains an external DNS concern. Do not change Cloudflare DNS,
proxy, or SSL/TLS settings as part of a site-code deployment.

Rollback is to restore the verified prior Pages source and the preserved root
index.html plus root CNAME. DNS should not be changed for this rollback.

## Remaining content TODOs

- Owner-approved public name, introduction, interests, and contact links
- Factual descriptions, statuses, links, and technical details for Zotero
  Wallpaper and Zontex
- Decision on how pjsk-tier-maker and score-calculator should appear in Works
- Owner-written notes and publication metadata
- Editorial assignments for the three quarantined note-cover candidates; no
  cover is downloaded until a published note provides a truthful `used_on`
  destination
