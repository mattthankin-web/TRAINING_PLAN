import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dateWindows, todayLocal } from "../src/dates.js";

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-12-30", 3), "2027-01-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("dateWindows covers the range inclusively without overlap", () => {
  assert.deepEqual(dateWindows("2026-01-01", "2026-01-10", 4), [
    ["2026-01-01", "2026-01-04"],
    ["2026-01-05", "2026-01-08"],
    ["2026-01-09", "2026-01-10"],
  ]);
  assert.deepEqual(dateWindows("2026-01-01", "2026-01-01", 90), [["2026-01-01", "2026-01-01"]]);
});

test("todayLocal uses Melbourne time, not UTC", () => {
  // 14:30 UTC on 17 Oct is 01:30 on 18 Oct in Melbourne (AEDT, UTC+11).
  assert.equal(todayLocal(new Date("2026-10-17T14:30:00Z")), "2026-10-18");
});
