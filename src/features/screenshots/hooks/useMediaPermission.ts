import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

import { androidMediaPermissionService, type MediaPermissionStatus } from "../services/androidMediaPermissionService";

export type MediaPermissionState = MediaPermissionStatus | "checking";

export function canReadImages(status: MediaPermissionState) {
  return status === "granted" || status === "limited";
}

/**
 * Read access to the device image library.
 *
 * Split out of the gallery hook so a screen that only needs to know whether the library is readable
 * — search, settings — does not also start paging it. Permission is re-read when the app returns to
 * the foreground, because it can be revoked from system settings while Recall is backgrounded.
 *
 * [onGranted] fires when access is confirmed after having been in doubt, which is where callers
 * refresh whatever they were unable to load.
 */
export function useMediaPermission(onGranted?: () => void) {
  const [status, setStatus] = useState<MediaPermissionState>("checking");

  const requestAccess = useCallback(async () => {
    const next = await androidMediaPermissionService.requestReadImagesPermission();
    setStatus(next);
    if (canReadImages(next)) onGranted?.();
    return next;
  }, [onGranted]);

  useEffect(() => {
    let active = true;

    androidMediaPermissionService.getReadImagesPermissionStatus().then(async (current) => {
      if (!active) return;
      if (current === "granted" || current === "limited" || current === "unsupported") {
        setStatus(current);
        return;
      }

      // Only prompt when the permission is genuinely undecided; a prior denial is left alone so the
      // system dialog is not re-thrown at someone who already said no.
      const requested = await androidMediaPermissionService.requestReadImagesPermission();
      if (active) setStatus(requested);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active") return;

      const current = await androidMediaPermissionService.getReadImagesPermissionStatus();
      setStatus(current);
      if (canReadImages(current)) onGranted?.();
    });

    return () => subscription.remove();
  }, [onGranted]);

  return {
    status,
    isReadable: canReadImages(status),
    requestAccess,
    openSettings: () => androidMediaPermissionService.openSettings()
  };
}
