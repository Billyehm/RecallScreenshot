/** A user-created group of screenshots, stored in user_collections. */
export type UserCollection = {
  id: string;
  name: string;
  /** Live membership count from screenshot_collections. */
  count: number;
  createdAt: number;
  updatedAt: number;
};

export type CollectionDraft = {
  name: string;
};
