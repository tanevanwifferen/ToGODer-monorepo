export * from "./HealthService";
export * from "./types";
// Note: AndroidHealthService, IOSHealthService, and WebHealthService are NOT exported here
// IOSHealthService imports native modules (@kingstinct/react-native-healthkit)
// and they are loaded dynamically by HealthService.ts based on Platform.OS
// Exporting them here would cause webpack web builds to fail
