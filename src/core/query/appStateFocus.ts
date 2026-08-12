import { focusManager } from "@tanstack/react-query";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Teaches react-query when the app is actually in front of the user.
 *
 * Without this the focus manager assumes permanently-focused, and the indexing-status poll keeps
 * firing every few seconds with the screen off. The pipeline itself is WorkManager's job; the UI
 * has no reason to ask about it while nobody is looking.
 */
export function startAppStateFocusTracking() {
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
      handleFocus(status === "active");
    });

    return () => subscription.remove();
  });
}
