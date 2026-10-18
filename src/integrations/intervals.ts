// Intervals.icu API client — only the endpoints this app uses.
// Auth: HTTP basic with username "API_KEY" and the personal key from /settings.
// Spec: https://intervals.icu/api/v1/docs

import { config } from "../config.js";
import { fetchJson } from "./http.js";

const BASE = "https://intervals.icu/api/v1";

// Subset of the Activity schema we read; the full payload is kept as `raw`.
export interface IntervalsActivity {
  id: string;
  start_date_local: string;
  type: string;
  name?: string | null;
  trainer?: boolean | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  distance?: number | null;
  total_elevation_gain?: number | null;
  icu_training_load?: number | null;
  icu_intensity?: number | null;
  icu_weighted_avg_watts?: number | null;
  icu_average_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  icu_ftp?: number | null;
  icu_weight?: number | null;
  decoupling?: number | null;
  icu_efficiency_factor?: number | null;
  icu_variability_index?: number | null;
  calories?: number | null;
  icu_rpe?: number | null;
  feel?: number | null;
  route_id?: number | null;
  paired_event_id?: number | null;
  source?: string | null;
  stream_types?: string[] | null;
  [key: string]: unknown;
}

export interface IntervalsWellness {
  id: string; // the date, YYYY-MM-DD
  ctl?: number | null;
  atl?: number | null;
  rampRate?: number | null;
  ctlLoad?: number | null;
  weight?: number | null;
  restingHR?: number | null;
  hrv?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  readiness?: number | null;
  avgSleepingHR?: number | null;
  spO2?: number | null;
  respiration?: number | null;
  vo2max?: number | null;
  steps?: number | null;
  soreness?: number | null;
  fatigue?: number | null;
  stress?: number | null;
  mood?: number | null;
  motivation?: number | null;
  [key: string]: unknown;
}

export interface IntervalsPowerCurve {
  secs?: number[] | null;
  watts?: number[] | null;
  watts_per_kg?: number[] | null;
}

function headers() {
  const token = Buffer.from(`API_KEY:${config.intervals.apiKey()}`).toString("base64");
  return { Authorization: `Basic ${token}`, Accept: "application/json" };
}

function athletePath(path: string) {
  return `${BASE}/athlete/${encodeURIComponent(config.intervals.athleteId)}${path}`;
}

// `oldest`/`newest` are local dates (YYYY-MM-DD), both inclusive.
export function listActivities(oldest: string, newest: string) {
  const qs = new URLSearchParams({ oldest, newest });
  return fetchJson<IntervalsActivity[]>(`${athletePath("/activities")}?${qs}`, { headers: headers() });
}

export function listWellness(oldest: string, newest: string) {
  const qs = new URLSearchParams({ oldest, newest });
  return fetchJson<IntervalsWellness[]>(`${athletePath("/wellness.json")}?${qs}`, { headers: headers() });
}

export function getActivityPowerCurve(activityId: string) {
  return fetchJson<IntervalsPowerCurve>(`${BASE}/activity/${encodeURIComponent(activityId)}/power-curve.json`, {
    headers: headers(),
  });
}
