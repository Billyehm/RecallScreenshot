export const queryKeys = {
  screenshots: ["screenshots"] as const,
  /**
   * Every paged list, regardless of filter. Narrower than [screenshots], which also prefixes the
   * index status, folder and storage queries — invalidating those on a progress tick would refetch
   * the very status query that reported the progress.
   */
  screenshotPages: ["screenshots", "page"] as const,
  screenshotPage: (pageSize: number, category?: string, collectionId?: string) =>
    ["screenshots", "page", pageSize, category ?? null, collectionId ?? null] as const,
  screenshotDetail: (id: string) => ["screenshots", "detail", id] as const,
  categoryCounts: ["screenshots", "categoryCounts"] as const,
  indexStatus: ["screenshots", "indexStatus"] as const,
  /** Prefixed by [screenshots] so a scope change invalidates it alongside the listings it reshapes. */
  indexScope: ["screenshots", "indexScope"] as const,
  mediaFolders: ["screenshots", "folders"] as const,
  storageInfo: ["screenshots", "storage"] as const,
  search: ["search"] as const,
  /**
   * [filterSignature] keeps two different filter sets from sharing one cache entry. It is passed in
   * already serialized so this module stays free of feature types.
   */
  searchResults: (query: string, category?: string, filterSignature?: string) =>
    ["search", "results", query, category ?? null, filterSignature ?? null] as const,
  similarScreenshots: (contentUri: string) => ["search", "similar", contentUri] as const,
  collections: ["collections"] as const,
  collectionSuggestions: ["collections", "suggestions"] as const,
  collectionMembers: (collectionId: string) => ["collections", "members", collectionId] as const
};
