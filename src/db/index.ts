import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pgSql?: ReturnType<typeof postgres>;
  db?: PostgresJsDatabase<typeof schema>;
};

export function getDb(): PostgresJsDatabase<typeof schema> {
  if (globalForDb.db) {
    return globalForDb.db;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required to connect to PostgreSQL."
    );
  }

  const sqlClient =
    globalForDb.pgSql ??
    postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });

  const dbInstance = drizzle(sqlClient, { schema });

  if (process.env.NODE_ENV !== "production") {
    globalForDb.pgSql = sqlClient;
    globalForDb.db = dbInstance;
  } else {
    globalForDb.pgSql = sqlClient;
    globalForDb.db = dbInstance;
  }

  return dbInstance;
}

export { schema };
