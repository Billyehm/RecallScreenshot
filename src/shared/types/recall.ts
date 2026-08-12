export type Screenshot = {
  id: string;
  title: string;
  source: string;
  time: string;
  accent: string;
  icon: string;
  /** Cached thumbnail when one exists, otherwise the original. Safe to render in lists. */
  uri?: string;
  /** Full-resolution original. Only load this in the viewer. */
  fullUri?: string;
  createdAt?: number;
  modifiedAt?: number;
  size?: number;
  width?: number;
  height?: number;
  category?: string;
  categoryConfidence?: number;
  tags?: string[];
  ocrText?: string;
  ocrConfidence?: number;
  ocrLanguage?: string;
  collectionIds?: string[];
  isIndexed?: boolean;
};
