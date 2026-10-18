# Training Plan — personal AI cycling coach

A single-athlete coach in the spirit of RestOrTrain: chat with Claude about
training, get a daily rest/train call from Garmin + Oura data, build bespoke
Zwift sessions, plan towards the Great Ocean & Otway Classic, and track it all
on a dashboard. See [DESIGN.md](DESIGN.md) for the full design and phases.

## Status

**Phase 1 — data foundation (this code):**
- Syncs rides, power curves, fitness/fatigue/form and wellness from Intervals.icu
- Syncs sleep, HRV, readiness, temperature and SpO2 directly from Oura (OAuth)
- Postgres schema (`coach.*`), seeded with your profile and target event
- Runs every 30 minutes on Fly.io; `npm run backfill` imports two years of history

Next: phase 2 (MCP connector so you can chat with your data in Claude), then
phase 3 (bespoke Zwift sessions from chat).

## Setup (one-off)

1. **Supabase**: create a new project (separate from HOME_ASSIST) and copy the
   connection string (Session pooler or direct).
2. **Fly.io**: `fly apps create training-plan` (or pick another name and update
   `fly.toml`). Your app URL is `https://<app>.fly.dev`.
3. **Intervals.icu**: Settings → Developer Settings → copy the API key.
4. **Oura**: create an OAuth application at
   <https://cloud.ouraring.com/oauth/applications> with redirect URI
   `https://<app>.fly.dev/oauth/oura/callback`. Copy client ID and secret.
5. Generate two secrets: `openssl rand -hex 20` (ADMIN_SECRET) and
   `openssl rand -hex 32` (TOKEN_ENCRYPTION_KEY).
6. **GitHub → Settings → Secrets → Actions**, add: `FLY_API_TOKEN`,
   `DATABASE_URL`, `PUBLIC_BASE_URL`, `ADMIN_SECRET`, `TOKEN_ENCRYPTION_KEY`,
   `INTERVALS_API_KEY`, `OURA_CLIENT_ID`, `OURA_CLIENT_SECRET`.
7. Merge to `main` — the workflow tests, migrates the database and deploys.
8. **Connect Oura**: open `https://<app>.fly.dev/oauth/oura/start?secret=<ADMIN_SECRET>`
   and approve.
9. **Backfill history** (locally, with a `.env` copied from `.env.example`):
   `npm install && npm run backfill`. Or trigger a recent sync on the server:
   `curl -X POST "https://<app>.fly.dev/sync?secret=<ADMIN_SECRET>&days=60"`.
10. Check it worked: `https://<app>.fly.dev/sync/status?secret=<ADMIN_SECRET>`.

## Development

```bash
npm install
npm run typecheck
npm test            # unit tests, no credentials needed
npm run migrate     # needs DATABASE_URL
npm run dev
```

## Endpoints

| Route | Purpose |
|---|---|
| `GET /healthz` | Liveness |
| `GET /sync/status?secret=…` | Latest result of each sync job |
| `POST /sync?secret=…&days=N` | Sync the last N days now (max 60) |
| `GET /oauth/oura/start?secret=…` | Connect Oura |
| `GET /oauth/oura/callback` | Oura OAuth redirect target |

## Notes

- Oura is the primary source for HRV trends; Intervals.icu wellness (Garmin-fed)
  is stored separately as `source = 'intervals'` and never mixed into Oura
  baselines.
- Oura refresh tokens are single-use; they're refreshed under a row lock and
  stored encrypted (AES-256-GCM).
- Keep your Zwift FTP equal to your Intervals.icu FTP — Zwift doesn't sync it.
