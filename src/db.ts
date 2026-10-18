import pg from "pg";
import { config } from "./config.js";

// Return `date` columns as plain "YYYY-MM-DD" strings rather than JS Dates, which
// pg would otherwise shift into the server's local timezone.
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl() });

export type Row = Record<string, unknown>;

// Upsert a batch of rows into `table`, using `conflictColumns` as the natural key.
// All rows must share the same keys. Every non-key column is overwritten on conflict,
// so re-syncing a date range simply refreshes it.
export async function upsertRows(table: string, conflictColumns: string[], rows: Row[]) {
  // Keep each statement well under Postgres' 65535 bind-parameter limit.
  for (let i = 0; i < rows.length; i += 200) {
    await upsertChunk(table, conflictColumns, rows.slice(i, i + 200));
  }
  return rows.length;
}

async function upsertChunk(table: string, conflictColumns: string[], rows: Row[]) {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((col) => {
      values.push(row[col]);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  const updates = columns
    .filter((c) => !conflictColumns.includes(c))
    .map((c) => `${c} = excluded.${c}`)
    .concat("synced_at = now()");

  await pool.query(
    `insert into ${table} (${columns.join(", ")}) values ${tuples.join(", ")}
     on conflict (${conflictColumns.join(", ")}) do update set ${updates.join(", ")}`,
    values
  );
}
