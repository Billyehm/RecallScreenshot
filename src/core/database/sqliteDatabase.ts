import { open, type NitroSQLiteConnection, type QueryResultRow, type SQLiteQueryParams } from "react-native-nitro-sqlite";

let database: NitroSQLiteConnection | null = null;

export function getSQLiteDatabase() {
  if (!database) {
    database = open({ name: "recall_ai.db" });
    // Both pragmas are per-connection, so they belong here rather than in a migration that only
    // ever runs once: without this, ON DELETE CASCADE silently stops firing on later launches.
    database.execute("PRAGMA foreign_keys = ON");
    database.execute("PRAGMA journal_mode = WAL");
  }

  return database;
}

export async function executeSql<Row extends QueryResultRow = QueryResultRow>(query: string, params?: SQLiteQueryParams) {
  return getSQLiteDatabase().executeAsync<Row>(query, params);
}

export async function executeMany(commands: Array<{ query: string; params?: SQLiteQueryParams | SQLiteQueryParams[] }>) {
  return getSQLiteDatabase().executeBatchAsync(commands);
}
