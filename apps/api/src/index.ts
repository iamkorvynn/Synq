import { loadApiConfig } from "./config";
import { buildServer } from "./server";

const config = loadApiConfig();
const port = config.port;

const app = await buildServer();

try {
  await app.listen({
    port,
    host: "0.0.0.0",
  });
  console.log(`Synq API listening on http://localhost:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
