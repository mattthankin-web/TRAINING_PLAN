import { config } from "./config.js";
import { buildServer } from "./server.js";
import { startScheduler } from "./scheduler.js";

const app = buildServer();

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    startScheduler();
    app.log.info(`Training coach listening on port ${config.port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
