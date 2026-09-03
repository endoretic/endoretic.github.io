---
title: "Zontex"
summary: "A local Zotero 10 research-library workflow driven through Codex, with a narrow bridge for what the local API does not expose."
lang: "en"
year: 2026
featured: true
tags: ["Zotero", "Codex", "Python", "GPL-3.0"]
repo: "https://github.com/endoretic/zontex-zotero-librarian"
coverScene: "relay"
placeholder: false
draft: false
---

Zontex is a research-library workflow for Zotero 10, made of a Codex plugin and
a lightweight component the project calls the Zontex Bridge. Codex interprets
the task, assembles candidate references, and plans writes. The Bridge supplies
the capabilities Zotero's authorised local API does not expose, without
modifying Zotero itself.

It handles library-wide deduplication and structured metadata, tag maintenance
and native item merging, citation rendering, reader navigation, CSL management,
and experimental native highlight and underline annotation in the open PDF. The
Bridge is described as a narrow-permission layer: it offers no arbitrary code
execution endpoint and does not take over ordinary create, read, update, and
delete operations.

When resolving citations it prefers an existing unique identifier, a DOI, PMID,
or ISBN, and where none exists it fills ordinary citation fields from sources
the user supplies rather than inventing an identifier.

The project is an independent adaptation of the OpenAI Zotero plugin. Its
repository states that it is not developed by, endorsed by, or affiliated with
Zotero, the Zotero project, OpenAI, or Ethereal Style and its author.

Released under the GPL-3.0 licence.
