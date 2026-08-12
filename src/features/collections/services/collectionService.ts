import { DuplicateCollectionNameError, SQLiteCollectionRepository } from "../data/sqliteCollectionRepository";
import type { UserCollection } from "../domain/collection";
import type { CollectionRepository } from "../domain/collectionRepository";

export class CollectionService {
  constructor(private readonly repository: CollectionRepository) {}

  list() {
    return this.repository.list();
  }

  create(name: string) {
    return this.repository.create(name);
  }

  rename(id: string, name: string) {
    return this.repository.rename(id, name);
  }

  remove(id: string) {
    return this.repository.remove(id);
  }

  addScreenshot(collectionId: string, screenshotId: string) {
    return this.repository.addScreenshot(collectionId, screenshotId);
  }

  addScreenshots(collectionId: string, screenshotIds: string[]) {
    return this.repository.addScreenshots(collectionId, screenshotIds);
  }

  /**
   * Creates the collection and files the given images into it.
   *
   * A name collision files into the existing collection rather than failing: the user asked for
   * these images to live under this name, and whether that name was already taken is not something
   * they should have to resolve. It also closes the gap between the card's duplicate check and this
   * write, where the same name could have been created in between.
   */
  async createWithScreenshots(name: string, screenshotIds: string[]): Promise<UserCollection> {
    const collection = await this.resolveByName(name);
    await this.repository.addScreenshots(collection.id, screenshotIds);
    return collection;
  }

  removeScreenshot(collectionId: string, screenshotId: string) {
    return this.repository.removeScreenshot(collectionId, screenshotId);
  }

  removeScreenshots(collectionId: string, screenshotIds: string[]) {
    return this.repository.removeScreenshots(collectionId, screenshotIds);
  }

  listScreenshotIds(collectionId: string) {
    return this.repository.listScreenshotIds(collectionId);
  }

  listForScreenshot(screenshotId: string) {
    return this.repository.listForScreenshot(screenshotId);
  }

  private async resolveByName(name: string): Promise<UserCollection> {
    try {
      return await this.repository.create(name);
    } catch (error) {
      if (!(error instanceof DuplicateCollectionNameError)) throw error;

      const trimmed = name.trim().toLowerCase();
      const existing = (await this.repository.list()).find((collection) => collection.name.toLowerCase() === trimmed);
      if (!existing) throw error;
      return existing;
    }
  }
}

export const collectionService = new CollectionService(new SQLiteCollectionRepository());
