/**
 * Base64 encoding/decoding for native (iOS/Android).
 * Uses react-native-quick-base64 for reliable native performance.
 */
import { fromByteArray, toByteArray } from 'react-native-quick-base64';

export function base64ToBytes(b64: string): Uint8Array {
  return toByteArray(b64);
}

export function bytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}
