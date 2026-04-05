import { resolve } from "node:path";

import { config as loadEnv } from "dotenv";
import { z } from "zod";

loadEnv({
  quiet: true,
});

const ApiConfigSchema = z.object({
  SYNQ_API_PORT: z.coerce.number().int().positive().default(4000),
  SYNQ_CORS_ORIGIN: z.string().url().default("http://localhost:3000"),
  SYNQ_STORE_DRIVER: z.enum(["memory", "postgres"]).default("memory"),
  SYNQ_POSTGRES_URL: z.string().optional(),
  SYNQ_STORAGE_DIR: z.string().default(".synq-storage"),
  SYNQ_LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type ApiConfig = {
  port: number;
  corsOrigin: string;
  storeDriver: "memory" | "postgres";
  postgresUrl?: string;
  storageDir: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
};

export function loadApiConfig(
  overrides: Partial<Record<keyof z.infer<typeof ApiConfigSchema>, string | number>> = {},
): ApiConfig {
  const defaultDriver =
    process.env.SYNQ_STORE_DRIVER ??
    (process.env.VITEST || process.env.NODE_ENV === "test"
      ? "memory"
      : process.env.SYNQ_POSTGRES_URL
        ? "postgres"
        : "memory");

  const parsed = ApiConfigSchema.parse({
    SYNQ_API_PORT: process.env.SYNQ_API_PORT,
    SYNQ_CORS_ORIGIN: process.env.SYNQ_CORS_ORIGIN,
    SYNQ_STORE_DRIVER: defaultDriver,
    SYNQ_POSTGRES_URL: process.env.SYNQ_POSTGRES_URL,
    SYNQ_STORAGE_DIR: process.env.SYNQ_STORAGE_DIR,
    SYNQ_LOG_LEVEL: process.env.SYNQ_LOG_LEVEL,
    ...overrides,
  });

  return {
    port: parsed.SYNQ_API_PORT,
    corsOrigin: parsed.SYNQ_CORS_ORIGIN,
    storeDriver: parsed.SYNQ_STORE_DRIVER,
    postgresUrl: parsed.SYNQ_POSTGRES_URL,
    storageDir: resolve(process.cwd(), parsed.SYNQ_STORAGE_DIR),
    logLevel: parsed.SYNQ_LOG_LEVEL,
  };
}
