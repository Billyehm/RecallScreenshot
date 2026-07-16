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
};

type ScreenshotMediaStoreModule = {
  queryScreenshots(limit: number, offset: number): Promise<NativeScreenshot[]>;
  getSha256(contentUri: string): Promise<string | undefined>;
  startWatching(): void;
  stopWatching(): void;
};

const nativeModule = NativeModules.ScreenshotMediaStore as ScreenshotMediaStoreModule | undefined;
const emitter = nativeModule ? new NativeEventEmitter(nativeModule as never) : undefined;

export const ScreenshotMediaStore = {
  isAvailable: Boolean(nativeModule),

  queryScreenshots(limit: number, offset: number) {
    if (!nativeModule) return Promise.resolve([]);
    return nativeModule.queryScreenshots(limit, offset);
  },

  getSha256(contentUri: string) {
    if (!nativeModule) return Promise.resolve(undefined);
    return nativeModule.getSha256(contentUri);
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
