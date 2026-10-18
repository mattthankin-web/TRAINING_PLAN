import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  timezone: process.env.TIMEZONE ?? "Australia/Melbourne",

  // Public https origin of this app, e.g. https://training-plan.fly.dev — used to
  // build OAuth redirect URIs, which must match what's registered with Oura exactly.
  publicBaseUrl: () => required("PUBLIC_BASE_URL").replace(/\/$/, ""),

  databaseUrl: () => required("DATABASE_URL"),

  // Guards the admin-only endpoints (OAuth connect, manual sync trigger). A random
  // string you choose, passed as ?secret=… — this is a single-user app, so a shared
  // secret is enough until the MCP/dashboard login lands in a later phase.
  adminSecret: () => required("ADMIN_SECRET"),

  // 32-byte key (hex) used to encrypt OAuth tokens at rest in Postgres.
  tokenEncryptionKey: () => required("TOKEN_ENCRYPTION_KEY"),

  intervals: {
    apiKey: () => required("INTERVALS_API_KEY"),
    // "0" means "the athlete who owns the API key".
    athleteId: process.env.INTERVALS_ATHLETE_ID ?? "0",
  },

  oura: {
    clientId: () => required("OURA_CLIENT_ID"),
    clientSecret: () => required("OURA_CLIENT_SECRET"),
  },
};
