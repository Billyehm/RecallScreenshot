export type ProcessingStatus = "Pending" | "Processing" | "Completed" | "Failed";

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
  ocrText: string;
  category: string;
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
