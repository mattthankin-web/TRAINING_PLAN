import { config } from "./config.js";

// Today's date (YYYY-MM-DD) in the athlete's timezone, not the server's.
export function todayLocal(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: config.timezone }).format(now);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Splits [oldest, newest] into consecutive inclusive windows of at most `days`.
export function dateWindows(oldest: string, newest: string, days: number): [string, string][] {
  const out: [string, string][] = [];
  for (let start = oldest; start <= newest; start = addDays(start, days)) {
    const end = addDays(start, days - 1);
    out.push([start, end < newest ? end : newest]);
  }
  return out;
}
