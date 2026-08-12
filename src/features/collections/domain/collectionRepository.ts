import type { UserCollection } from "./collection";

export interface CollectionRepository {
  list(): Promise<UserCollection[]>;
  create(name: string): Promise<UserCollection>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  addScreenshot(collectionId: string, screenshotId: string): Promise<void>;
  /** Files a whole cluster at once. One transaction, so a partial file is never left behind. */
  addScreenshots(collectionId: string, screenshotIds: string[]): Promise<void>;
  removeScreenshot(collectionId: string, screenshotId: string): Promise<void>;
  /** Unfiles a selection at once, for the same reason [addScreenshots] files one. */
  removeScreenshots(collectionId: string, screenshotIds: string[]): Promise<void>;
  listForScreenshot(screenshotId: string): Promise<string[]>;
  /** Every screenshot filed under this collection, so membership can be edited as a whole. */
  listScreenshotIds(collectionId: string): Promise<string[]>;
}
