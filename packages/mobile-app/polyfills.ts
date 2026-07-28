/**
 * Polyfills for React Native crypto support
 * Must be imported at the app entry point before any crypto usage
 */
import { initConsoleErrorService, initNetworkErrorCapture } from "./services/ConsoleErrorService";

// Intercept console.error/warn/log before anything else runs
initConsoleErrorService();
// Intercept fetch/XHR failures and unhandled rejections
initNetworkErrorCapture();

import { install } from "react-native-quick-crypto";
import { Buffer } from "@craftzdog/react-native-buffer";

// Install crypto polyfills (sets global.Buffer and global.crypto)
install();

// Ensure Buffer is accessible globally
if (typeof global.Buffer === "undefined") {
  (global as any).Buffer = Buffer;
}

// Verify Buffer.from is available
if (typeof Buffer.from !== "function") {
  console.error("Buffer.from is not a function after polyfill installation");
}
