import Fastify from "fastify";
import { config } from "./config.js";
import { pool } from "./db.js";
import { secretMatches, signState, verifyState } from "./crypto.js";
import * as oura from "./integrations/oura.js";
import { syncRecent } from "./scheduler.js";

export function buildServer() {
  const app = Fastify({ logger: true });

  app.get("/healthz", async () => ({ ok: true }));

  const isAdmin = (query: unknown) =>
    secretMatches((query as Record<string, string>)?.secret, config.adminSecret());

  // Latest outcome of each sync job.
  app.get("/sync/status", async (req, reply) => {
    if (!isAdmin(req.query)) return reply.code(403).send();
    const { rows } = await pool.query(
      `select distinct on (job) job, started_at, finished_at, ok, detail
       from coach.sync_runs order by job, started_at desc`
    );
    return rows;
  });

  // Manual sync of the last `days` days (default 10).
  app.post("/sync", async (req, reply) => {
    if (!isAdmin(req.query)) return reply.code(403).send();
    const days = Math.min(Number((req.query as Record<string, string>).days ?? 10) || 10, 60);
    const result = await syncRecent(days);
    return result ?? { skipped: "A sync is already running" };
  });

  // One-time Oura connection: open /oauth/oura/start?secret=… in a browser, approve
  // in Oura, and the callback stores the (encrypted) tokens.
  app.get("/oauth/oura/start", async (req, reply) => {
    if (!isAdmin(req.query)) return reply.code(403).send();
    return reply.redirect(oura.authorizeUrl(signState()));
  });

  app.get("/oauth/oura/callback", async (req, reply) => {
    const { code, state, error } = req.query as Record<string, string | undefined>;
    if (error) return reply.code(400).send(`Oura returned an error: ${error}`);
    if (!code || !verifyState(state)) return reply.code(400).send("Invalid or expired OAuth state");
    await oura.exchangeCode(code);
    return reply.type("text/plain").send("Oura connected. You can close this tab.");
  });

  return app;
}
