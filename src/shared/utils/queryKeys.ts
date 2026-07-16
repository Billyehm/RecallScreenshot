export const queryKeys = {
  screenshots: ["screenshots"] as const,
  screenshotPage: (pageSize: number) => ["screenshots", "page", pageSize] as const,
  collections: ["collections"] as const,
  efficiency: ["efficiency"] as const,
  chatMessages: ["chatMessages"] as const
};
