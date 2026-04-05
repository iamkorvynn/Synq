import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool } from "pg";

const postgresUrl = process.env.SYNQ_POSTGRES_URL;

if (!postgresUrl) {
  throw new Error("SYNQ_POSTGRES_URL is required to run migrations.");
}

const currentDir = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(currentDir, "../schema/synq.sql");
const schema = await readFile(schemaPath, "utf8");

const pool = new Pool({
  connectionString: postgresUrl,
});

try {
  await pool.query(schema);
  console.log(`Applied Synq schema from ${schemaPath}`);
} finally {
  await pool.end();
}
