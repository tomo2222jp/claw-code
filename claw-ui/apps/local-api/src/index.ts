import Fastify from "fastify";

import { ClawEngineAdapter } from "./adapters/claw-engine-adapter.js";
import { registerHealthRoutes } from "./routes/health-routes.js";
import { registerRunRoutes } from "./routes/run-routes.js";
import { registerSettingsRoutes } from "./routes/settings-routes.js";
import { RunService } from "./services/run-service.js";
import { resolveSettingsFilePath, SettingsService } from "./services/settings-service.js";
import type { AppContext } from "./types/app-context.js";

const port = Number.parseInt(process.env.PORT ?? "4000", 10);
const host = process.env.HOST ?? "127.0.0.1";

async function buildServer(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({ logger: true });
  const context: AppContext = {
    settingsService: new SettingsService(resolveSettingsFilePath()),
    runService: new RunService(new ClawEngineAdapter()),
  };

  await registerHealthRoutes(app);
  await registerSettingsRoutes(app, context);
  await registerRunRoutes(app, context);

  return app;
}

async function main(): Promise<void> {
  const app = await buildServer();
  try {
    await app.listen({ host, port });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

void main();
