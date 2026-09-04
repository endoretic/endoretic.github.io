import assert from "node:assert/strict";
import test from "node:test";

import { formatHtmlDate, formatIsoWeekDate } from "../src/lib/date.ts";

test("ISO week dates preserve the weekday and handle week-year boundaries", () => {
  assert.equal(formatIsoWeekDate("2026-09-04"), "2026-W36-5");
  assert.equal(formatIsoWeekDate("2021-01-01"), "2020-W53-5");
  assert.equal(formatIsoWeekDate("2024-12-30"), "2025-W01-1");
});

test("HTML time values remain calendar dates", () => {
  assert.equal(formatHtmlDate("2026-09-04"), "2026-09-04");
  assert.equal(
    formatHtmlDate(new Date("2026-09-04T23:30:00-07:00")),
    "2026-09-05",
  );
});
