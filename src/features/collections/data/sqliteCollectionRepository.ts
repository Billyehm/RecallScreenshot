import { executeMany, executeSql } from "../../../core/database/sqliteDatabase";
import { runDatabaseMigrations } from "../../../core/database/migrations";
import type { UserCollection } from "../domain/collection";
import type { CollectionRepository } from "../domain/collectionRepository";

type CollectionRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  count: number;
};

export class DuplicateCollectionNameError extends Error {
  constructor(name: string) {
    super(`A collection named "${name}" already exists.`);
    this.name = "DuplicateCollectionNameError";
  }
}

export class SQLiteCollectionRepository implements CollectionRepository {
  private async initialize() {
    await runDatabaseMigrations();
  }

  /**
   * Counts come from the membership table rather than a stored column, so a screenshot removed by
   * the indexer's cascade can never leave a collection showing a stale total.
   */
  async list(): Promise<UserCollection[]> {
    await this.initialize();

    const result = await executeSql<CollectionRow>(
      `SELECT c.id, c.name, c.created_at, c.updated_at, COUNT(sc.screenshot_id) AS count
       FROM user_collections c
       LEFT JOIN screenshot_collections sc ON sc.collection_id = c.id
       GROUP BY c.id, c.name, c.created_at, c.updated_at
       ORDER BY c.created_at DESC`
    );

    return (result.rows?._array ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      count: row.count ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  async create(name: string): Promise<UserCollection> {
    await this.initialize();

    const trimmed = name.trim();
    if (await this.nameExists(trimmed)) {
      throw new DuplicateCollectionNameError(trimmed);
    }

    const now = Date.now();
    const id = createId();
    await executeSql(`INSERT INTO user_collections (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`, [
      id,
      trimmed,
      now,
      now
    ]);

    return { id, name: trimmed, count: 0, createdAt: now, updatedAt: now };
  }

  async rename(id: string, name: string): Promise<void> {
    await this.initialize();

    const trimmed = name.trim();
    if (await this.nameExists(trimmed, id)) {
      throw new DuplicateCollectionNameError(trimmed);
    }

    await executeSql(`UPDATE user_collections SET name = ?, updated_at = ? WHERE id = ?`, [trimmed, Date.now(), id]);
  }

  /** Membership rows go with it through ON DELETE CASCADE; screenshots themselves are untouched. */
  async remove(id: string): Promise<void> {
    await this.initialize();
    await executeSql(`DELETE FROM user_collections WHERE id = ?`, [id]);
  }

  async addScreenshot(collectionId: string, screenshotId: string): Promise<void> {
    await this.initialize();

    // Re-adding an image is a no-op rather than an error: the viewer toggles membership.
    await executeSql(
      `INSERT OR IGNORE INTO screenshot_collections (screenshot_id, collection_id, created_at) VALUES (?, ?, ?)`,
      [screenshotId, collectionId, Date.now()]
    );
    await executeSql(`UPDATE user_collections SET updated_at = ? WHERE id = ?`, [Date.now(), collectionId]);
  }

  /**
   * Files a suggested cluster in one batch rather than a statement per member. `INSERT OR IGNORE`
   * keeps it idempotent, so re-filing a cluster whose members are already partly in the collection
   * adds only what is missing.
   */
  async addScreenshots(collectionId: string, screenshotIds: string[]): Promise<void> {
    await this.initialize();

    const unique = Array.from(new Set(screenshotIds.filter(Boolean)));
    if (!unique.length) return;

    const now = Date.now();
    await executeMany([
      {
        query: `INSERT OR IGNORE INTO screenshot_collections (screenshot_id, collection_id, created_at) VALUES (?, ?, ?)`,
        params: unique.map((screenshotId) => [screenshotId, collectionId, now])
      },
      { query: `UPDATE user_collections SET updated_at = ? WHERE id = ?`, params: [now, collectionId] }
    ]);
  }

  async removeScreenshot(collectionId: string, screenshotId: string): Promise<void> {
    await this.initialize();

    await executeSql(`DELETE FROM screenshot_collections WHERE screenshot_id = ? AND collection_id = ?`, [
      screenshotId,
      collectionId
    ]);
    await executeSql(`UPDATE user_collections SET updated_at = ? WHERE id = ?`, [Date.now(), collectionId]);
  }

  async listForScreenshot(screenshotId: string): Promise<string[]> {
    await this.initialize();

    const result = await executeSql<{ collection_id: string }>(
      `SELECT collection_id FROM screenshot_collections WHERE screenshot_id = ?`,
      [screenshotId]
    );

    return (result.rows?._array ?? []).map((row) => row.collection_id);
  }

  /** Unfiles a selection in one batch. Ids that were never members are silently skipped. */
  async removeScreenshots(collectionId: string, screenshotIds: string[]): Promise<void> {
    await this.initialize();

    const unique = Array.from(new Set(screenshotIds.filter(Boolean)));
    if (!unique.length) return;

    const now = Date.now();
    await executeMany([
      {
        query: `DELETE FROM screenshot_collections WHERE screenshot_id = ? AND collection_id = ?`,
        params: unique.map((screenshotId) => [screenshotId, collectionId])
      },
      { query: `UPDATE user_collections SET updated_at = ? WHERE id = ?`, params: [now, collectionId] }
    ]);
  }

  async listScreenshotIds(collectionId: string): Promise<string[]> {
    await this.initialize();

    const result = await executeSql<{ screenshot_id: string }>(
      `SELECT screenshot_id FROM screenshot_collections WHERE collection_id = ? ORDER BY created_at DESC`,
      [collectionId]
    );

    return (result.rows?._array ?? []).map((row) => row.screenshot_id);
  }

  private async nameExists(name: string, excludeId?: string) {
    const result = await executeSql<{ id: string }>(
      `SELECT id FROM user_collections WHERE name = ? COLLATE NOCASE LIMIT 1`,
      [name]
    );

    const existing = result.rows?._array?.[0];
    return Boolean(existing) && existing?.id !== excludeId;
  }
}

/** Local-only identifier; no uuid dependency is worth pulling in for a single-device store. */
function createId() {
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
