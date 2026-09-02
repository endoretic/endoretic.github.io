# endoretic.cc

A static personal archive built with Astro and TypeScript.

This repository is in its foundation phase. It contains working routes and
typed content collections, but biographical details, project descriptions, and
published notes remain owner-supplied TODOs. No third-party visual or audio
media is used.

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

## Build and validation

Run Astro's type and content checks:

    npm run check

Create the production output:

    npm run build

Verify the generated routes, draft exclusion, CNAME, semantic shell, and
no-remote-media baseline after building:

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

This foundation contains no third-party images, video, audio, or remote fonts.
The inline geometry and favicon are original repository-authored SVG/CSS.

Do not add third-party media until its original source, exact license,
attribution, local files, modifications, and pages used are recorded through
the asset-manifest workflow described in AGENTS.md and the design brief.

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
- Verified media candidates and the later asset-rights pipeline
