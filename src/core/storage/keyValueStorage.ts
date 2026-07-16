import { createMMKV } from "react-native-mmkv";

export interface KeyValueStorage {
  getString(key: string): string | undefined;
  setString(key: string, value: string): void;
  delete(key: string): void;
}

const storage = createMMKV({ id: "recall-ai" });

export const keyValueStorage: KeyValueStorage = {
  getString: (key) => storage.getString(key),
  setString: (key, value) => storage.set(key, value),
  delete: (key) => {
    storage.remove(key);
  }
};
