export type ProcessingStatus = "Pending" | "Processing" | "Completed" | "Failed";

/** Recognized text for one screenshot, produced on device by the indexing pipeline. */
export type ScreenshotOcr = {
  text: string;
  /** Mean recognition confidence in 0..1; 0 when no text was found. */
  confidence: number;
  /** BCP-47 tag for the dominant text block, or "und" when undetermined. */
  language: string;
};

export type ScreenshotMetadata = {
  id: string;
  mediaStoreUri: string;
  absolutePath?: string;
  fileName: string;
  fileSize: number;
  width: number;
  height: number;
  mimeType: string;
  dateCreated: number;
  dateModified: number;
  contentHash?: string;
  thumbnailPath?: string;
  ocr: ScreenshotOcr;
  category: string;
  /** 0..1 share of evidence behind the assigned category. */
  categoryConfidence: number;
  /** Keywords the categorizer matched, ordered by relevance. */
  autoTags: string[];
  processingStatus: ProcessingStatus;
  ocrStatus: ProcessingStatus;
  embeddingStatus: ProcessingStatus;
  favoriteFlag: boolean;
  hiddenFlag: boolean;
  archivedFlag: boolean;
  collectionIds: string[];
  userNotes?: string;
  userTags: string[];
  lastViewedAt?: number;
  viewCount: number;
  searchCount: number;
};

export type MetadataSyncResult = {
  scanId: string;
  upserted: number;
  deleted: number;
};

/** Narrows a listing to one category, one collection, or both. */
export type ScreenshotFilter = {
  category?: string;
  collectionId?: string;
};

export type CategoryCount = {
  category: string;
  count: number;
};
