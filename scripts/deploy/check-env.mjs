import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.production");

if (!existsSync(envPath)) {
  console.error("Missing .env.production. Copy .env.production.example and fill in your deployment values.");
  process.exit(1);
}

const content = readFileSync(envPath, "utf8");
const pairs = Object.fromEntries(
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separatorIndex = line.indexOf("=");
      return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
    }),
);

const requiredKeys = [
  "SYNQ_DOMAIN",
  "SYNQ_TLS_EMAIL",
  "SYNQ_POSTGRES_DB",
  "SYNQ_POSTGRES_USER",
  "SYNQ_POSTGRES_PASSWORD",
];

const missing = requiredKeys.filter((key) => !pairs[key]?.trim());

if (missing.length) {
  console.error(`Missing required deployment values: ${missing.join(", ")}`);
  process.exit(1);
}

if (pairs.SYNQ_POSTGRES_PASSWORD === "change-this-to-a-long-random-secret") {
  console.error("SYNQ_POSTGRES_PASSWORD is still using the example placeholder.");
  process.exit(1);
}

console.log(`Deployment env looks ready for ${pairs.SYNQ_DOMAIN}.`);
