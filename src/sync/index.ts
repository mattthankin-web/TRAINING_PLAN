import { pool, upsertRows } from "../db.js";
import { dateWindows } from "../dates.js";
import * as intervals from "../integrations/intervals.js";
import * as oura from "../integrations/oura.js";
import { hasPower, mapActivity, mapIntervalsWellness, mapLoad, mapOuraDays, mapPowerBests } from "./mappers.js";

// Each job is idempotent over its date range: re-running it just refreshes rows.

export async function syncIntervalsActivities(oldest: string, newest: string) {
  let activities = 0;
  let powerCurves = 0;
  for (const [from, to] of dateWindows(oldest, newest, 90)) {
    const list = await intervals.listActivities(from, to);
    await upsertRows("coach.activities", ["id"], list.map(mapActivity));
    activities += list.length;

    // Power curves only need fetching once per ride — skip any we already have.
    const withPower = list.filter(hasPower).map((a) => a.id);
    const { rows } = await pool.query(
      "select distinct activity_id from coach.activity_power_bests where activity_id = any($1)",
      [withPower]
    );
    const done = new Set(rows.map((r) => r.activity_id as string));
    for (const id of withPower.filter((id) => !done.has(id))) {
      const curve = await intervals.getActivityPowerCurve(id);
      await upsertRows("coach.activity_power_bests", ["activity_id", "duration_s"], mapPowerBests(id, curve));
      powerCurves++;
    }
  }
  return { activities, powerCurves };
}

export async function syncIntervalsWellness(oldest: string, newest: string) {
  let days = 0;
  for (const [from, to] of dateWindows(oldest, newest, 180)) {
    const list = await intervals.listWellness(from, to);
    await upsertRows("coach.load_daily", ["date"], list.map(mapLoad));
    await upsertRows("coach.wellness_daily", ["date", "source"], list.map(mapIntervalsWellness));
    days += list.length;
  }
  return { days };
}

export async function syncOura(oldest: string, newest: string) {
  if (!(await oura.isConnected())) return { skipped: "Oura not connected" };
  let days = 0;
  for (const [from, to] of dateWindows(oldest, newest, 60)) {
    // Oura files each night under the day it ends on (the morning), which is the
    // day its recovery applies to — so all four collections line up by `day`.
    const [readiness, dailySleep, sleeps, spo2] = await Promise.all([
      oura.listDailyReadiness(from, to),
      oura.listDailySleep(from, to),
      oura.listSleep(from, to),
      oura.listDailySpo2(from, to),
    ]);
    const rows = mapOuraDays(readiness, dailySleep, sleeps, spo2);
    await upsertRows("coach.wellness_daily", ["date", "source"], rows);
    days += rows.length;
  }
  return { days };
}

// Runs a job and records the outcome in coach.sync_runs. Never throws, so one
// failing source doesn't stop the others.
export async function runJob(job: string, fn: () => Promise<unknown>) {
  const { rows } = await pool.query("insert into coach.sync_runs (job) values ($1) returning id", [job]);
  const id = rows[0].id;
  try {
    const detail = await fn();
    await pool.query("update coach.sync_runs set finished_at = now(), ok = true, detail = $2 where id = $1", [
      id,
      JSON.stringify(detail ?? {}),
    ]);
    return { job, ok: true, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await pool.query("update coach.sync_runs set finished_at = now(), ok = false, detail = $2 where id = $1", [
      id,
      JSON.stringify({ error: message }),
    ]);
    return { job, ok: false, error: message };
  }
}

export async function syncAll(oldest: string, newest: string) {
  return [
    await runJob("intervals.activities", () => syncIntervalsActivities(oldest, newest)),
    await runJob("intervals.wellness", () => syncIntervalsWellness(oldest, newest)),
    await runJob("oura", () => syncOura(oldest, newest)),
  ];
}
