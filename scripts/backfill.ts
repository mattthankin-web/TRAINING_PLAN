// One-off history import: `npm run backfill` (default 730 days) or
// `npm run backfill -- 365`. Safe to re-run; rows are upserted.
import { addDays, todayLocal } from "../src/dates.js";
import { pool } from "../src/db.js";
import { syncAll } from "../src/sync/index.js";

async function main() {
  const days = Number(process.argv[2] ?? 730);
  const newest = todayLocal();
  const oldest = addDays(newest, -days);
  console.log(`Backfilling ${oldest} → ${newest}...`);
  for (const result of await syncAll(oldest, newest)) console.log(JSON.stringify(result));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
