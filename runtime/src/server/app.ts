import Fastify from "fastify";
import { registerRoutes } from "./routes";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.RUNTIME_LOG_LEVEL ?? "info",
    },
  });
  await registerRoutes(app);
  return app;
}

async function main() {
  const app = await buildApp();
  const port = Number(process.env.RUNTIME_PORT ?? 3282);
  await app.listen({ port, host: "0.0.0.0" });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

