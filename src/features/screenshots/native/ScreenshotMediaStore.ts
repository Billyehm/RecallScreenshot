import { NativeEventEmitter, NativeModules } from "react-native";

export type NativeScreenshot = {
  id: string;
  title: string;
  source: string;
  uri: string;
  absolutePath?: string;
  fileName: string;
  createdAt: number;
  modifiedAt: number;
  size: number;
  width: number;
  height: number;
  mimeType: string;
};

export type ImageSearchResult = NativeScreenshot & {
  category: string;
  categoryConfidence: number;
  tags: string[];
  /** Cached thumbnail, or null when the platform has reclaimed it. */
  thumbnailUri: string | null;
  /** Combined ranking score. Comparable inside one result set, not across searches. */
  score: number;
  /** Indexed terms this image actually carries, so a result can explain why it ranked. */
  matchedTerms: string[];
  ocrText: string;
  ocrConfidence: number;
  ocrLanguage: string;
};

/**
 * A cluster of unfiled images the native index thinks belong together. The name, keywords and
 * representative image are all derived from the images themselves.
 */
export type NativeCollectionSuggestion = {
  id: string;
  name: string;
  keywords: string[];
  memberIds: string[];
  size: number;
  /** Mean cosine of the members to their centroid: how tight the group is. */
  cohesion: number;
  category: string;
  representativeId: string;
  representativeUri: string;
  representativeThumbnailUri: string | null;
};

export type ImageIndexStatus = {
  state: "idle" | "running" | "paused";
  discovered: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
};

/**
 * Explicit search filters. Each one is a hard exclusion applied by the native ranker before its
 * candidate cut, so a narrow filter still returns a full page rather than a trimmed one.
 */
export type NativeSearchFilters = {
  category?: string;
  /** Half-open epoch-millis window. Both omitted or equal means no date constraint. */
  fromMillis?: number;
  toMillis?: number;
  /** Only images where OCR found text. */
  hasText?: boolean;
  /** Matched against the image's folder path. */
  folder?: string;
};

/** A device folder the user can include in or exclude from indexing. */
export type MediaFolder = {
  name: string;
  /** Images the folder holds according to MediaStore. */
  imageCount: number;
  /** How many of them Recall has actually indexed. */
  indexedCount: number;
  isIndexed: boolean;
};

/**
 * Which kinds of image Recall indexes. Screenshots only until the user widens it, so reading and
 * processing a whole photo library is always something they opted into.
 *
 * Independent of the folder scope: this decides what counts as indexable, folders decide where Recall
 * looks for it.
 */
export type IndexScope = "screenshotsOnly" | "allImages";

/** What the index occupies. Images are referenced by URI and never copied, so they are not counted. */
export type StorageInfo = {
  databaseBytes: number;
  thumbnailBytes: number;
  indexedImages: number;
  ocrRecords: number;
  embeddings: number;
  tokens: number;
};

type ScreenshotMediaStoreModule = {
  queryImages(limit: number, offset: number): Promise<NativeScreenshot[]>;
  getSha256(contentUri: string): Promise<string | undefined>;
  startIndexing(): Promise<void>;
  pauseIndexing(): Promise<void>;
  resumeIndexing(): Promise<void>;
  getIndexStatus(): Promise<ImageIndexStatus>;
  searchText(query: string, filters: NativeSearchFilters | null, limit: number): Promise<ImageSearchResult[]>;
  deleteImage(contentUri: string): Promise<boolean>;
  deleteImages(contentUris: string[]): Promise<boolean>;
  shareImage(contentUri: string, mimeType: string): Promise<boolean>;
  shareImages(contentUris: string[], mimeType: string): Promise<boolean>;
  clearAiData(): Promise<boolean>;
  deleteDatabase(): Promise<boolean>;
  listFolders(): Promise<MediaFolder[]>;
  setIndexedFolders(folders: string[]): Promise<boolean>;
  getIndexScope(): Promise<IndexScope>;
  setIndexScope(scope: IndexScope): Promise<boolean>;
  getStorageInfo(): Promise<StorageInfo>;
  searchSimilar(contentUri: string, limit: number): Promise<ImageSearchResult[]>;
  suggestCollections(limit: number): Promise<NativeCollectionSuggestion[]>;
  startWatching(): void;
  stopWatching(): void;
};

const nativeModule = NativeModules.ScreenshotMediaStore as ScreenshotMediaStoreModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : undefined;

/** Returned when the native module is absent, so callers always get a shaped object to render. */
const EMPTY_STORAGE_INFO: StorageInfo = {
  databaseBytes: 0,
  thumbnailBytes: 0,
  indexedImages: 0,
  ocrRecords: 0,
  embeddings: 0,
  tokens: 0
};

export const ScreenshotMediaStore = {
  isAvailable: Boolean(nativeModule),

  queryImages(limit: number, offset: number) {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.queryImages(limit, offset);
  },

  getSha256(contentUri: string) {
    if (!nativeModule) return Promise.resolve(undefined);
    return nativeModule.getSha256(contentUri);
  },

  startIndexing() {
    if (!nativeModule) return Promise.resolve();
    return nativeModule.startIndexing();
  },

  pauseIndexing() {
    if (!nativeModule) return Promise.resolve();
    return nativeModule.pauseIndexing();
  },

  resumeIndexing() {
    if (!nativeModule) return Promise.resolve();
    return nativeModule.resumeIndexing();
  },

  getIndexStatus(): Promise<ImageIndexStatus> {
    if (!nativeModule) {
      return Promise.resolve({ state: "idle", discovered: 0, pending: 0, processing: 0, completed: 0, failed: 0 });
    }
    return nativeModule.getIndexStatus();
  },

  /** Filters narrow the native scan; pass null for an unfiltered search. */
  searchText(query: string, filters: NativeSearchFilters | null = null, limit = 40): Promise<ImageSearchResult[]> {
    if (!nativeModule) return Promise.resolve([]);
    // A bare filter is a valid search: it browses that slice by relevance to nothing, which the
    // native ranker resolves to recency.
    const hasFilter = Boolean(
      filters && (filters.category || filters.hasText || filters.folder || (filters.toMillis ?? 0) > (filters.fromMillis ?? 0))
    );
    if (!query.trim() && !hasFilter) return Promise.resolve([]);
    return nativeModule.searchText(query, filters, limit);
  },

  /**
   * Resolves true when the image was deleted, false when the user declined the system dialog. From
   * Android 11 that dialog is mandatory and cannot be pre-answered by the app.
   */
  deleteImage(contentUri: string): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.deleteImage(contentUri);
  },

  /**
   * Deletes several images behind a single system dialog. Resolves true when the deletion went
   * ahead, false when the user declined — the same contract as [deleteImage], because from Android 11
   * the platform confirms the whole selection at once rather than image by image.
   */
  deleteImages(contentUris: string[]): Promise<boolean> {
    if (!nativeModule || contentUris.length === 0) return Promise.resolve(false);
    return nativeModule.deleteImages(contentUris);
  },

  shareImage(contentUri: string, mimeType = "image/*"): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.shareImage(contentUri, mimeType);
  },

  shareImages(contentUris: string[], mimeType = "image/*"): Promise<boolean> {
    if (!nativeModule || contentUris.length === 0) return Promise.resolve(false);
    return nativeModule.shareImages(contentUris, mimeType);
  },

  /** Drops derived AI data and re-queues the library. Images and categories are untouched. */
  clearAiData(): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.clearAiData();
  },

  deleteDatabase(): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.deleteDatabase();
  },

  listFolders(): Promise<MediaFolder[]> {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.listFolders();
  },

  setIndexedFolders(folders: string[]): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.setIndexedFolders(folders);
  },

  /** Falls back to the narrower scope, which is also the native default. */
  getIndexScope(): Promise<IndexScope> {
    if (!nativeModule) return Promise.resolve("screenshotsOnly");
    return nativeModule.getIndexScope();
  },

  /** Stores the scope and queues a rescan, which retires anything the new scope excludes. */
  setIndexScope(scope: IndexScope): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.setIndexScope(scope);
  },

  getStorageInfo(): Promise<StorageInfo> {
    if (!nativeModule) return Promise.resolve(EMPTY_STORAGE_INFO);
    return nativeModule.getStorageInfo();
  },

  searchSimilar(contentUri: string, limit = 40): Promise<ImageSearchResult[]> {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.searchSimilar(contentUri, limit);
  },

  suggestCollections(limit = 3): Promise<NativeCollectionSuggestion[]> {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.suggestCollections(limit);
  },

  startWatching() {
    nativeModule?.startWatching();
  },

  stopWatching() {
    nativeModule?.stopWatching();
  },

  subscribe(listener: () => void) {
    const subscription = emitter?.addListener("ScreenshotMediaStore.changed", listener);
    return () => subscription?.remove();
  }
};
