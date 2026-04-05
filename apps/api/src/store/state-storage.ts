import type { Session, SynqBootstrapState } from "@synq/protocol";
import { SessionSchema, SynqBootstrapStateSchema } from "@synq/protocol";
import { Pool } from "pg";
import { z } from "zod";

export interface PersistedRuntime {
  state: SynqBootstrapState;
  sessions: Session[];
}

const PersistedRuntimeSchema = z.object({
  state: SynqBootstrapStateSchema,
  sessions: z.array(SessionSchema),
});

export interface RuntimeStateStorage {
  driver: "memory" | "postgres";
  load(seed: PersistedRuntime): Promise<PersistedRuntime>;
  save(runtime: PersistedRuntime): Promise<void>;
  health(): Promise<{ ok: boolean; driver: string }>;
  close(): Promise<void>;
}

export class MemoryRuntimeStateStorage implements RuntimeStateStorage {
  driver = "memory" as const;

  constructor(private runtime: PersistedRuntime | null = null) {}

  async load(seed: PersistedRuntime) {
    if (!this.runtime) {
      this.runtime = structuredClone(seed);
    }

    return structuredClone(this.runtime);
  }

  async save(runtime: PersistedRuntime) {
    this.runtime = structuredClone(runtime);
  }

  async health() {
    return {
      ok: true,
      driver: this.driver,
    };
  }

  async close() {}
}

export class PostgresRuntimeStateStorage implements RuntimeStateStorage {
  driver = "postgres" as const;
  private initialized = false;

  constructor(private readonly pool: Pool) {}

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await this.pool.query(`
      create table if not exists synq_runtime_state (
        id text primary key,
        payload jsonb not null,
        updated_at timestamptz not null default now()
      )
    `);

    this.initialized = true;
  }

  async load(seed: PersistedRuntime) {
    await this.ensureInitialized();
    const existing = await this.pool.query<{
      payload: PersistedRuntime;
    }>(
      "select payload from synq_runtime_state where id = $1",
      ["primary"],
    );

    if (!existing.rowCount) {
      await this.save(seed);
      return structuredClone(seed);
    }

    return PersistedRuntimeSchema.parse(existing.rows[0].payload);
  }

  async save(runtime: PersistedRuntime) {
    await this.ensureInitialized();
    await this.pool.query(
      `
        insert into synq_runtime_state (id, payload, updated_at)
        values ($1, $2::jsonb, now())
        on conflict (id)
        do update set payload = excluded.payload, updated_at = now()
      `,
      ["primary", JSON.stringify(runtime)],
    );
  }

  async health() {
    await this.ensureInitialized();
    await this.pool.query("select 1");
    return {
      ok: true,
      driver: this.driver,
    };
  }

  async close() {
    await this.pool.end();
  }
}
