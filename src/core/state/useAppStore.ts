import { create } from "zustand";

type AppState = {
  hasCompletedBootstrap: boolean;
  setHasCompletedBootstrap: (value: boolean) => void;
};

export const useAppStore = create<AppState>((set) => ({
  hasCompletedBootstrap: false,
  setHasCompletedBootstrap: (value) => set({ hasCompletedBootstrap: value })
}));
