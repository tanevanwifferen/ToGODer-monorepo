/**
 * Web polyfills - intentionally empty
 *
 * Web browsers have native crypto support via the Web Crypto API.
 * The react-native-quick-crypto polyfills are NOT needed on web,
 * and including them would cause build errors because they contain
 * native module dependencies.
 *
 * Metro/webpack automatically selects this file for web builds
 * based on the .web.ts extension.
 */

// Web has native Buffer support via Uint8Array and no polyfill is needed
// The WebCryptoService uses native Web Crypto API directly

import { initConsoleErrorService } from "./services/ConsoleErrorService";

// Intercept console.error/warn/log before anything else runs
initConsoleErrorService();

// Export empty to satisfy any potential imports
export {};
