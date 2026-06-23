import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

function missingDatabaseError() {
  return new Error(
    "DATABASE_URL must be set to use database-backed routes.",
  );
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : ({
      query: async () => {
        throw missingDatabaseError();
      },
    } as unknown as pg.Pool);

export const db = process.env.DATABASE_URL
  ? drizzle(pool, { schema })
  : (new Proxy(
      {},
      {
        get() {
          throw missingDatabaseError();
        },
      },
    ) as ReturnType<typeof drizzle>);

export * from "./schema";
