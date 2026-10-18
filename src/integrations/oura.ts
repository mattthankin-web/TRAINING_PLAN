// Oura API v2 client. Personal access tokens were retired in Dec 2025, so this
// uses a single-user OAuth app; tokens live encrypted in coach.oauth_tokens.
// Docs: https://cloud.ouraring.com/v2/docs

import { config } from "../config.js";
import { pool } from "../db.js";
import { decrypt, encrypt } from "../crypto.js";
import { fetchJson } from "./http.js";

const AUTHORIZE_URL = "https://cloud.ouraring.com/oauth/authorize";
const TOKEN_URL = "https://api.ouraring.com/oauth/token";
const API = "https://api.ouraring.com/v2/usercollection";
const SCOPES = ["personal", "daily", "heartrate", "workout", "spo2Daily"];

export function redirectUri() {
  return `${config.publicBaseUrl()}/oauth/oura/callback`;
}

export function authorizeUrl(state: string) {
  const qs = new URLSearchParams({
    response_type: "code",
    client_id: config.oura.clientId(),
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    state,
  });
  return `${AUTHORIZE_URL}?${qs}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
}

async function requestToken(params: Record<string, string>) {
  return fetchJson<TokenResponse>(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...params,
      client_id: config.oura.clientId(),
      client_secret: config.oura.clientSecret(),
    }),
  });
}

async function saveToken(t: TokenResponse) {
  await pool.query(
    `insert into coach.oauth_tokens (provider, access_token_enc, refresh_token_enc, expires_at, scope, updated_at)
     values ('oura', $1, $2, now() + make_interval(secs => $3), $4, now())
     on conflict (provider) do update set
       access_token_enc = excluded.access_token_enc,
       refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at,
       scope = excluded.scope,
       updated_at = now()`,
    [encrypt(t.access_token), encrypt(t.refresh_token), t.expires_in, t.scope ?? null]
  );
}

export async function exchangeCode(code: string) {
  await saveToken(await requestToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri() }));
}

export async function isConnected() {
  const { rowCount } = await pool.query("select 1 from coach.oauth_tokens where provider = 'oura'");
  return (rowCount ?? 0) > 0;
}

// Returns a valid access token, refreshing it when within a day of expiry.
// Oura refresh tokens are single-use, so the refresh and the save of the new pair
// happen under a row lock — two overlapping syncs must not both spend the same one.
async function accessToken(): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows } = await client.query(
      `select access_token_enc, refresh_token_enc, expires_at > now() + interval '1 day' as fresh
       from coach.oauth_tokens where provider = 'oura' for update`
    );
    if (rows.length === 0) throw new Error("Oura is not connected — visit /oauth/oura/start");
    if (rows[0].fresh) {
      await client.query("commit");
      return decrypt(rows[0].access_token_enc);
    }
    const t = await requestToken({ grant_type: "refresh_token", refresh_token: decrypt(rows[0].refresh_token_enc) });
    await client.query(
      `update coach.oauth_tokens set access_token_enc = $1, refresh_token_enc = $2,
         expires_at = now() + make_interval(secs => $3), scope = coalesce($4, scope), updated_at = now()
       where provider = 'oura'`,
      [encrypt(t.access_token), encrypt(t.refresh_token), t.expires_in, t.scope ?? null]
    );
    await client.query("commit");
    return t.access_token;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

// Fetches every page of a date-ranged collection. Dates are YYYY-MM-DD.
async function listCollection<T>(collection: string, startDate: string, endDate: string): Promise<T[]> {
  const token = await accessToken();
  const out: T[] = [];
  let nextToken: string | null = null;
  do {
    const qs = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (nextToken) qs.set("next_token", nextToken);
    const page: { data: T[]; next_token?: string | null } = await fetchJson(`${API}/${collection}?${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    out.push(...page.data);
    nextToken = page.next_token ?? null;
  } while (nextToken);
  return out;
}

export interface OuraDailyReadiness {
  day: string;
  score?: number | null;
  temperature_deviation?: number | null;
  temperature_trend_deviation?: number | null;
  contributors: Record<string, number | null>;
}

export interface OuraDailySleep {
  day: string;
  score?: number | null;
  contributors: Record<string, number | null>;
}

export interface OuraSleep {
  day: string;
  type?: "deleted" | "sleep" | "long_sleep" | "late_nap" | "rest" | null;
  bedtime_start: string;
  bedtime_end: string;
  average_hrv?: number | null;
  average_heart_rate?: number | null;
  lowest_heart_rate?: number | null;
  average_breath?: number | null;
  total_sleep_duration?: number | null;
  deep_sleep_duration?: number | null;
  rem_sleep_duration?: number | null;
  light_sleep_duration?: number | null;
  awake_time?: number | null;
  efficiency?: number | null;
  latency?: number | null;
}

export interface OuraDailySpo2 {
  day: string;
  spo2_percentage?: { average?: number | null } | null;
}

export const listDailyReadiness = (s: string, e: string) => listCollection<OuraDailyReadiness>("daily_readiness", s, e);
export const listDailySleep = (s: string, e: string) => listCollection<OuraDailySleep>("daily_sleep", s, e);
export const listSleep = (s: string, e: string) => listCollection<OuraSleep>("sleep", s, e);
export const listDailySpo2 = (s: string, e: string) => listCollection<OuraDailySpo2>("daily_spo2", s, e);
