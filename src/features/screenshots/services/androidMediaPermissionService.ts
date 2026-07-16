import { PermissionsAndroid, Platform } from "react-native";

export class AndroidMediaPermissionService {
  async requestReadImagesPermission(): Promise<boolean> {
    if (Platform.OS !== "android") {
      return false;
    }

    if (Platform.Version >= 34) {
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" as never
      ]);

      return hasAcceptedStatus(results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES]) ||
        hasAcceptedStatus(results["android.permission.READ_MEDIA_VISUAL_USER_SELECTED"]);
    }

    const permission = Platform.Version >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    const currentStatus = await PermissionsAndroid.check(permission);
    if (currentStatus) {
      return true;
    }

    const result = await PermissionsAndroid.request(permission, {
      title: "Allow screenshot access",
      message: "Recall needs local image access to discover screenshots on this device.",
      buttonPositive: "Allow",
      buttonNegative: "Not now"
    });

    return hasAcceptedStatus(result);
  }
}

export const androidMediaPermissionService = new AndroidMediaPermissionService();

function hasAcceptedStatus(status: string | undefined) {
  return status === PermissionsAndroid.RESULTS.GRANTED || status === "limited";
}
