// Pure functions that turn API payloads into coach.* rows. Kept free of I/O so
// they can be unit tested without a database or credentials.

import type { IntervalsActivity, IntervalsPowerCurve, IntervalsWellness } from "../integrations/intervals.js";
import type { OuraDailyReadiness, OuraDailySleep, OuraDailySpo2, OuraSleep } from "../integrations/oura.js";
import type { Row } from "../db.js";

// Durations we track bests for: sprint → neuromuscular → VO2 → threshold → endurance.
export const POWER_BEST_DURATIONS_S = [5, 15, 30, 60, 120, 300, 480, 600, 1200, 1800, 3600, 5400, 7200];

const INDOOR_TYPES = new Set(["VirtualRide"]);

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const int = (v: unknown) => (n(v) === null ? null : Math.round(v as number));

export function mapActivity(a: IntervalsActivity): Row {
  return {
    id: a.id,
    start_date_local: a.start_date_local,
    type: a.type,
    name: a.name ?? null,
    indoor: Boolean(a.trainer) || INDOOR_TYPES.has(a.type),
    moving_time_s: int(a.moving_time),
    elapsed_time_s: int(a.elapsed_time),
    distance_m: n(a.distance),
    elevation_gain_m: n(a.total_elevation_gain),
    training_load: int(a.icu_training_load),
    intensity: n(a.icu_intensity),
    normalized_power: int(a.icu_weighted_avg_watts),
    avg_power: int(a.icu_average_watts),
    avg_hr: int(a.average_heartrate),
    max_hr: int(a.max_heartrate),
    avg_cadence: n(a.average_cadence),
    ftp: int(a.icu_ftp),
    weight_kg: n(a.icu_weight),
    decoupling: n(a.decoupling),
    efficiency_factor: n(a.icu_efficiency_factor),
    variability_index: n(a.icu_variability_index),
    calories: int(a.calories),
    rpe: int(a.icu_rpe),
    feel: int(a.feel),
    route_id: int(a.route_id),
    paired_event_id: int(a.paired_event_id),
    source: a.source ?? null,
    raw: JSON.stringify(a),
  };
}

export function hasPower(a: IntervalsActivity): boolean {
  return Array.isArray(a.stream_types) ? a.stream_types.includes("watts") : n(a.icu_average_watts) !== null;
}

// Picks our standard durations out of an activity power curve. Durations longer
// than the ride (absent from the curve) are skipped rather than extrapolated.
export function mapPowerBests(activityId: string, curve: IntervalsPowerCurve): Row[] {
  const secs = curve.secs ?? [];
  const watts = curve.watts ?? [];
  const wkg = curve.watts_per_kg ?? [];
  const rows: Row[] = [];
  for (const duration of POWER_BEST_DURATIONS_S) {
    const i = secs.indexOf(duration);
    if (i === -1 || !n(watts[i])) continue;
    rows.push({
      activity_id: activityId,
      duration_s: duration,
      watts: Math.round(watts[i]),
      watts_per_kg: n(wkg[i]),
    });
  }
  return rows;
}

export function mapLoad(w: IntervalsWellness): Row {
  return {
    date: w.id,
    ctl: n(w.ctl),
    atl: n(w.atl),
    ramp_rate: n(w.rampRate),
    daily_load: n(w.ctlLoad),
  };
}

// Every wellness row shares one column set, so batches upsert cleanly.
function emptyWellness(date: string, source: "intervals" | "oura"): Row {
  return {
    date,
    source,
    hrv_rmssd: null,
    resting_hr: null,
    lowest_hr: null,
    avg_sleeping_hr: null,
    sleep_s: null,
    deep_sleep_s: null,
    rem_sleep_s: null,
    light_sleep_s: null,
    awake_s: null,
    sleep_efficiency: null,
    sleep_latency_s: null,
    bedtime_start: null,
    bedtime_end: null,
    sleep_score: null,
    readiness_score: null,
    temperature_deviation: null,
    respiratory_rate: null,
    spo2: null,
    weight_kg: null,
    vo2max: null,
    steps: null,
    soreness: null,
    fatigue: null,
    stress: null,
    mood: null,
    motivation: null,
    readiness_contributors: null,
    sleep_contributors: null,
    raw: "{}",
  };
}

export function mapIntervalsWellness(w: IntervalsWellness): Row {
  return {
    ...emptyWellness(w.id, "intervals"),
    hrv_rmssd: n(w.hrv),
    resting_hr: n(w.restingHR),
    avg_sleeping_hr: n(w.avgSleepingHR),
    sleep_s: int(w.sleepSecs),
    sleep_score: n(w.sleepScore),
    readiness_score: n(w.readiness),
    respiratory_rate: n(w.respiration),
    spo2: n(w.spO2),
    weight_kg: n(w.weight),
    vo2max: n(w.vo2max),
    steps: int(w.steps),
    soreness: int(w.soreness),
    fatigue: int(w.fatigue),
    stress: int(w.stress),
    mood: int(w.mood),
    motivation: int(w.motivation),
    raw: JSON.stringify(w),
  };
}

// The night that counts for a day is its main sleep: the longest `long_sleep`
// period, falling back to the longest period of any kind (naps excluded).
export function mainSleep(periods: OuraSleep[]): OuraSleep | null {
  const candidates = periods.filter((p) => p.type !== "deleted" && p.type !== "late_nap" && p.type !== "rest");
  const pool = candidates.some((p) => p.type === "long_sleep")
    ? candidates.filter((p) => p.type === "long_sleep")
    : candidates;
  return pool.reduce<OuraSleep | null>(
    (best, p) => (!best || (p.total_sleep_duration ?? 0) > (best.total_sleep_duration ?? 0) ? p : best),
    null
  );
}

// Merges Oura's separate collections into one row per day.
export function mapOuraDays(
  readiness: OuraDailyReadiness[],
  dailySleep: OuraDailySleep[],
  sleeps: OuraSleep[],
  spo2: OuraDailySpo2[] = []
): Row[] {
  const days = new Set([...readiness, ...dailySleep, ...sleeps, ...spo2].map((d) => d.day));
  const byDay = <T extends { day: string }>(list: T[]) => new Map(list.map((x) => [x.day, x]));
  const r = byDay(readiness);
  const ds = byDay(dailySleep);
  const sp = byDay(spo2);

  return [...days].sort().map((day) => {
    const rd = r.get(day);
    const dsl = ds.get(day);
    const s = mainSleep(sleeps.filter((x) => x.day === day));
    return {
      ...emptyWellness(day, "oura"),
      hrv_rmssd: n(s?.average_hrv),
      resting_hr: n(s?.lowest_heart_rate),
      lowest_hr: n(s?.lowest_heart_rate),
      avg_sleeping_hr: n(s?.average_heart_rate),
      sleep_s: int(s?.total_sleep_duration),
      deep_sleep_s: int(s?.deep_sleep_duration),
      rem_sleep_s: int(s?.rem_sleep_duration),
      light_sleep_s: int(s?.light_sleep_duration),
      awake_s: int(s?.awake_time),
      sleep_efficiency: n(s?.efficiency),
      sleep_latency_s: int(s?.latency),
      bedtime_start: s?.bedtime_start ?? null,
      bedtime_end: s?.bedtime_end ?? null,
      sleep_score: n(dsl?.score),
      readiness_score: n(rd?.score),
      temperature_deviation: n(rd?.temperature_deviation),
      respiratory_rate: n(s?.average_breath),
      spo2: n(sp.get(day)?.spo2_percentage?.average),
      readiness_contributors: rd ? JSON.stringify(rd.contributors) : null,
      sleep_contributors: dsl ? JSON.stringify(dsl.contributors) : null,
      raw: JSON.stringify({ readiness: rd ?? null, daily_sleep: dsl ?? null, sleep: s ?? null }),
    };
  });
}
