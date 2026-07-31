import type { Env } from "./env";

export interface WellnessEntry {
  id: string; // date, e.g. "2026-07-31"
  ctl?: number; // fitness
  atl?: number; // fatigue
  rampRate?: number;
  restingHR?: number;
  hrv?: number;
  sleepSecs?: number;
}

function authHeader(apiKey: string): string {
  return "Basic " + btoa(`API_KEY:${apiKey}`);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getWellness(env: Env, days = 14): Promise<WellnessEntry[]> {
  const newest = new Date();
  const oldest = new Date(newest.getTime() - days * 86400000);
  const fields = "id,ctl,atl,rampRate,restingHR,hrv,sleepSecs";
  const url =
    `https://intervals.icu/api/v1/athlete/${env.INTERVALS_ATHLETE_ID}/wellness.json` +
    `?oldest=${isoDate(oldest)}&newest=${isoDate(newest)}&fields=${fields}`;

  const res = await fetch(url, {
    headers: { Authorization: authHeader(env.INTERVALS_API_KEY) },
  });
  if (!res.ok) {
    throw new Error(`intervals.icu wellness fetch failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
