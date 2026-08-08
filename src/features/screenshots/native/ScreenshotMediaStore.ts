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
  thumbnailUri?: string;
  score: number;
  ocrText: string;
};

export type ImageIndexStatus = {
  state: "idle" | "running" | "paused";
  discovered: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
};

type ScreenshotMediaStoreModule = {
  queryImages(limit: number, offset: number): Promise<NativeScreenshot[]>;
  getSha256(contentUri: string): Promise<string | undefined>;
  startIndexing(): Promise<void>;
  pauseIndexing(): Promise<void>;
  resumeIndexing(): Promise<void>;
  getIndexStatus(): Promise<ImageIndexStatus>;
  searchText(query: string, limit: number): Promise<ImageSearchResult[]>;
  searchSimilar(contentUri: string, limit: number): Promise<ImageSearchResult[]>;
  startWatching(): void;
  stopWatching(): void;
};

const nativeModule = NativeModules.ScreenshotMediaStore as ScreenshotMediaStoreModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : undefined;

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

  searchText(query: string, limit = 40) {
    if (!nativeModule || !query.trim()) return Promise.resolve([]);
    return nativeModule.searchText(query, limit);
  },

  searchSimilar(contentUri: string, limit = 40) {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.searchSimilar(contentUri, limit);
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
