import { Linking, PermissionsAndroid, Platform } from "react-native";

export type MediaPermissionStatus = "granted" | "limited" | "denied" | "unsupported";

export class AndroidMediaPermissionService {
  async getReadImagesPermissionStatus(): Promise<MediaPermissionStatus> {
    if (Platform.OS !== "android") {
      return "unsupported";
    }

    const permission = Platform.Version >= 33
      ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES
      : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    if (await PermissionsAndroid.check(permission)) {
      return "granted";
    }

    if (Platform.Version >= 34) {
      const hasSelectedAccess = await PermissionsAndroid.check(
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" as never
      );
      if (hasSelectedAccess) return "limited";
    }

    return "denied";
  }

  async requestReadImagesPermission(): Promise<MediaPermissionStatus> {
    if (Platform.OS !== "android") {
      return "unsupported";
    }

    if (Platform.Version >= 34) {
      if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES)) {
        return "granted";
      }

      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
        "android.permission.READ_MEDIA_VISUAL_USER_SELECTED" as never
      ]);

      if (results[PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES] === PermissionsAndroid.RESULTS.GRANTED) {
        return "granted";
      }

      return results["android.permission.READ_MEDIA_VISUAL_USER_SELECTED"] === PermissionsAndroid.RESULTS.GRANTED
        ? "limited"
        : "denied";
    }

    const permission = Platform.Version >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

    const currentStatus = await PermissionsAndroid.check(permission);
    if (currentStatus) {
      return "granted";
    }

    const result = await PermissionsAndroid.request(permission, {
      title: "Allow photo access",
      message: "Recall needs access to your photo library to index and search images stored on this device.",
      buttonPositive: "Allow",
      buttonNegative: "Not now"
    });

    return result === PermissionsAndroid.RESULTS.GRANTED ? "granted" : "denied";
  }

  openSettings() {
    return Linking.openSettings();
  }
}

export const androidMediaPermissionService = new AndroidMediaPermissionService();

