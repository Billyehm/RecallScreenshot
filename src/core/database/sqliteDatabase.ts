import { open, type NitroSQLiteConnection, type QueryResultRow, type SQLiteQueryParams } from "react-native-nitro-sqlite";

let database: NitroSQLiteConnection | null = null;

export function getSQLiteDatabase() {
  if (!database) {
    database = open({ name: "recall_ai.db" });
  }

  return database;
}

export async function executeSql<Row extends QueryResultRow = QueryResultRow>(query: string, params?: SQLiteQueryParams) {
  return getSQLiteDatabase().executeAsync<Row>(query, params);
}

export async function executeMany(commands: Array<{ query: string; params?: SQLiteQueryParams | SQLiteQueryParams[] }>) {
  return getSQLiteDatabase().executeBatchAsync(commands);
}
