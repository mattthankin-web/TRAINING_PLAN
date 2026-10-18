import { test } from "node:test";
import assert from "node:assert/strict";
import { hasPower, mainSleep, mapActivity, mapIntervalsWellness, mapLoad, mapOuraDays, mapPowerBests } from "../src/sync/mappers.js";
import type { OuraSleep } from "../src/integrations/oura.js";

test("mapActivity flags Zwift rides as indoor and rounds integer fields", () => {
  const row = mapActivity({
    id: "i1",
    start_date_local: "2026-10-14T06:00:00",
    type: "VirtualRide",
    icu_training_load: 72.6,
    icu_weighted_avg_watts: 231.4,
    average_heartrate: 141.5,
  });
  assert.equal(row.indoor, true);
  assert.equal(row.training_load, 73);
  assert.equal(row.normalized_power, 231);
  assert.equal(row.avg_hr, 142);
  assert.equal(row.distance_m, null);
});

test("mapActivity treats trainer rides as indoor and outdoor rides as not", () => {
  assert.equal(mapActivity({ id: "a", start_date_local: "x", type: "Ride", trainer: true }).indoor, true);
  assert.equal(mapActivity({ id: "b", start_date_local: "x", type: "Ride" }).indoor, false);
});

test("hasPower prefers stream types, falls back to average watts", () => {
  assert.equal(hasPower({ id: "a", start_date_local: "x", type: "Ride", stream_types: ["heartrate"] }), false);
  assert.equal(hasPower({ id: "a", start_date_local: "x", type: "Ride", stream_types: ["watts"] }), true);
  assert.equal(hasPower({ id: "a", start_date_local: "x", type: "Ride", icu_average_watts: 180 }), true);
});

test("mapPowerBests keeps only standard durations present in the curve", () => {
  const rows = mapPowerBests("i1", {
    secs: [1, 5, 60, 300, 1200],
    watts: [900, 850.6, 420, 300, 0],
    watts_per_kg: [12, 11.3, 5.6, 4.0, 0],
  });
  assert.deepEqual(
    rows.map((r) => [r.duration_s, r.watts]),
    [
      [5, 851],
      [60, 420],
      [300, 300],
    ]
  );
});

test("mapLoad and mapIntervalsWellness use the wellness id as the date", () => {
  const w = { id: "2026-10-14", ctl: 61.2, atl: 70.1, rampRate: 4.1, ctlLoad: 85, hrv: 58, restingHR: 48 };
  assert.deepEqual(mapLoad(w), { date: "2026-10-14", ctl: 61.2, atl: 70.1, ramp_rate: 4.1, daily_load: 85 });
  const row = mapIntervalsWellness(w);
  assert.equal(row.date, "2026-10-14");
  assert.equal(row.source, "intervals");
  assert.equal(row.hrv_rmssd, 58);
  assert.equal(row.resting_hr, 48);
});

const sleep = (over: Partial<OuraSleep>): OuraSleep => ({
  day: "2026-10-15",
  bedtime_start: "2026-10-14T22:30:00+11:00",
  bedtime_end: "2026-10-15T06:30:00+11:00",
  ...over,
});

test("mainSleep prefers the longest long_sleep and ignores naps", () => {
  const night = sleep({ type: "long_sleep", total_sleep_duration: 25000 });
  const nap = sleep({ type: "late_nap", total_sleep_duration: 30000 });
  const short = sleep({ type: "long_sleep", total_sleep_duration: 9000 });
  assert.equal(mainSleep([nap, short, night]), night);
  assert.equal(mainSleep([nap]), null);
});

test("mapOuraDays merges readiness, sleep score and the main night per day", () => {
  const rows = mapOuraDays(
    [{ day: "2026-10-15", score: 82, temperature_deviation: 0.3, contributors: { hrv_balance: 75 } }],
    [{ day: "2026-10-15", score: 77, contributors: { total_sleep: 70 } }],
    [sleep({ type: "long_sleep", total_sleep_duration: 26000, average_hrv: 61, lowest_heart_rate: 46 })],
    [{ day: "2026-10-16", spo2_percentage: { average: 96.5 } }]
  );
  assert.equal(rows.length, 2);
  const [d15, d16] = rows;
  assert.equal(d15.date, "2026-10-15");
  assert.equal(d15.readiness_score, 82);
  assert.equal(d15.sleep_score, 77);
  assert.equal(d15.temperature_deviation, 0.3);
  assert.equal(d15.hrv_rmssd, 61);
  assert.equal(d15.resting_hr, 46);
  assert.equal(d15.sleep_s, 26000);
  assert.equal(d15.readiness_contributors, JSON.stringify({ hrv_balance: 75 }));
  assert.equal(d16.spo2, 96.5);
  assert.equal(d16.hrv_rmssd, null);
  // Every row has the same column set, so batches upsert in one statement.
  assert.deepEqual(Object.keys(d15), Object.keys(d16));
  assert.deepEqual(Object.keys(d15), Object.keys(mapIntervalsWellness({ id: "2026-10-15" })));
});
