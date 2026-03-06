// Centralized runtime configuration access for API/share URLs
// Web builds do not reliably expose Constants.expoConfig.extra in production.
// Therefore:
// - On web, prefer EXPO_PUBLIC_* and then fall back to window.location with the correct path.
// - On native, prefer app.json -> expo.extra, then EXPO_PUBLIC_*.
import Constants from "expo-constants";
import { Platform } from "react-native";

type Extra = {
  apiUrl?: string;
  shareUrl?: string;
};

function readExtra(): Extra {
  // Try multiple locations because Constants fields differ per platform/build type.
  // On native dev/prod, expoConfig.extra should exist.
  // On older SDKs/dev server, manifestExtra could exist.
  const extra = ((Constants as any)?.expoConfig?.extra ??
    (Constants as any)?.manifestExtra ??
    {}) as Extra;
  return extra;
}

export function getApiUrl(): string {
  // WEB: prefer public env var then default to current origin + /api
  if (Platform.OS === "web") {
    const envUrl = process.env.EXPO_PUBLIC_API_URL;
    if (envUrl && envUrl.trim().length > 0) return envUrl;
    if (typeof window !== "undefined" && window.location) {
      return `${window.location.origin}/api`;
    }
    return "/api";
  }

  // NATIVE: prefer extra from app.json, then EXPO_PUBLIC_*
  const extra = readExtra();
  return extra.apiUrl ?? process.env.EXPO_PUBLIC_API_URL ?? "";
}

export function getShareUrl(): string {
  // WEB: prefer public env var then default to current origin + /shared
  if (Platform.OS === "web") {
    const envUrl = process.env.EXPO_PUBLIC_SHARE_URL;
    if (envUrl && envUrl.trim().length > 0) return envUrl;
    if (typeof window !== "undefined" && window.location) {
      return `${window.location.origin}/shared`;
    }
    return "/shared";
  }

  // NATIVE: prefer extra from app.json, then EXPO_PUBLIC_*
  const extra = readExtra();
  return extra.shareUrl ?? process.env.EXPO_PUBLIC_SHARE_URL ?? "";
}

export const Env = {
  getApiUrl,
  getShareUrl,
};
