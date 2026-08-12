import { useCallback, useState } from "react";

import { keyValueStorage } from "../../../core/storage/keyValueStorage";
import type { LibraryLayout } from "../components/ScreenshotBrowser";

const STORAGE_KEY = "library.layout";

function readStored(): LibraryLayout {
  // Grid is the default: it is the denser view, and the one people expect from a photo library.
  return keyValueStorage.getString(STORAGE_KEY) === "list" ? "list" : "grid";
}

/**
 * Grid/list preference for the library, remembered across launches. Reading MMKV is synchronous, so
 * the first render already has the stored value and the layout never visibly flips after mount.
 */
export function useLibraryLayout() {
  const [layout, setLayout] = useState<LibraryLayout>(readStored);

  const toggleLayout = useCallback(() => {
    setLayout((current) => {
      const next: LibraryLayout = current === "grid" ? "list" : "grid";
      keyValueStorage.setString(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const chooseLayout = useCallback((next: LibraryLayout) => {
    keyValueStorage.setString(STORAGE_KEY, next);
    setLayout(next);
  }, []);

  return { layout, toggleLayout, chooseLayout };
}
