---
title: "World Link Calculator for PJSK"
summary: "A static event-point planning tool for Project SEKAI World Link tiering."
lang: "en"
year: 2026
tags: ["Project SEKAI", "tool", "JavaScript", "MIT"]
repo: "https://github.com/endoretic/score-calculator"
demo: "https://endoretic.cc/score-calculator/"
coverScene: "hall"
placeholder: false
draft: false
---

A planner for Project SEKAI World Link event points. It compares chapter event
points against overall event points while searching for target digit patterns,
fixed chapter totals, and lower-effort point plans.

Single mode plans one remaining chapter while holding the difference between
the two figures unchanged. Multi mode plans several chapter scores and totals
them. Exact-match and lock controls fix a final score once a chapter has ended
or a target is already decided. Digit rules can require, prefer, or exclude
digit groups, and an optional stricter setting turns a preference into an
at-least-one requirement.

The interface is available in Japanese, Chinese, and English, each using the
World Link terminology familiar to that player community. It is a static site
and runs from a plain file server.

Released under the MIT licence. The licence covers the source in the
repository, not Project SEKAI content.
