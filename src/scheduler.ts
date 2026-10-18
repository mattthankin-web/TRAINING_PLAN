import cron from "node-cron";
import { config } from "./config.js";
import { addDays, todayLocal } from "./dates.js";
import { syncAll } from "./sync/index.js";

let running = false;

// Refreshes the recent past. Intervals.icu recalculates load for a few days after a
// ride and athletes edit RPE/notes later, so a rolling window catches those edits.
export async function syncRecent(days = 10) {
  if (running) return null;
  running = true;
  try {
    const today = todayLocal();
    return await syncAll(addDays(today, -days), today);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  // Every 30 minutes: rides land shortly after the Edge 830 / Zwift upload, and
  // Oura sleep lands after the morning app sync.
  cron.schedule("*/30 * * * *", () => void syncRecent(), { timezone: config.timezone });
}
