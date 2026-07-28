/**
 * ServerLogService — in-memory ring buffer for server-side error/warn logs.
 *
 * A shared singleton that key failure points (image generation, upstream API
 * errors, auth failures, etc.) write to. Admin accounts can query recent logs
 * via GET /api/admin/logs?since=<ISO>&limit=<n>.
 *
 * v1: ring buffer in memory only. No disk persistence.
 */

export interface ServerLogEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** error | warn */
  level: "error" | "warn";
  /** Human-readable message (truncated) */
  message: string;
  /** Optional context: request ID, user ID, tool name, etc. */
  context?: Record<string, unknown>;
}

const MAX_ENTRIES = 500;

const buffer: ServerLogEntry[] = [];

function push(entry: ServerLogEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

/**
 * Log a server-side event into the ring buffer.
 * Thread-safe for single-threaded Node (no locking needed).
 */
export function serverLog(
  level: "error" | "warn",
  message: string,
  context?: Record<string, unknown>,
): void {
  push({
    timestamp: new Date().toISOString(),
    level,
    message: message.slice(0, 500),
    context,
  });
}

/**
 * Return buffered log entries, newest first.
 * Filters to entries at or after `since` (ISO timestamp), capped at `limit`.
 */
export function getServerLogs(
  since?: string,
  limit?: number,
): ServerLogEntry[] {
  let results = [...buffer].reverse();
  if (since) {
    results = results.filter((e) => e.timestamp >= since);
  }
  if (limit != null && limit > 0) {
    results = results.slice(0, limit);
  }
  return results;
}

/**
 * Return counts per level.
 */
export function getServerLogSummary(): { error: number; warn: number } {
  const counts = { error: 0, warn: 0 };
  for (const e of buffer) {
    counts[e.level]++;
  }
  return counts;
}

/** Clear the ring buffer. */
export function clearServerLogs(): void {
  buffer.length = 0;
}
