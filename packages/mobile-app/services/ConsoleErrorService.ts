/**
 * ConsoleErrorService — client-side ring buffer for console errors.
 *
 * Intercepts console.error, console.warn, and console.log and stores the
 * last N entries in a fixed-size ring buffer. ToGODer queries recent errors
 * via the `get_console_errors` frontend tool, and the Settings debug panel
 * reads them directly. Everything lives client-side — no server API, no HTTP.
 */

/** One buffered console entry. */
export interface ConsoleErrorEntry {
  /** ISO 8601 timestamp */
  timestamp: string;
  /** error | warn | log */
  level: "error" | "warn" | "log";
  /** First argument coerced to string (truncated for safety) */
  message: string;
  /** stack trace if available (only for Error objects passed to console.error) */
  stack?: string;
}

const MAX_ENTRIES = 100;

// ── Original console methods (saved before interception) ────────────
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let originalLog: typeof console.log;

/** Ring buffer of recent entries. */
const buffer: ConsoleErrorEntry[] = [];

/** Push one entry; evict oldest when full. */
function push(entry: ConsoleErrorEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

/** Extract a stack trace from an Error argument if one was passed. */
function extractStack(args: unknown[]): string | undefined {
  for (const arg of args) {
    if (arg instanceof Error && arg.stack) {
      return arg.stack;
    }
  }
  return undefined;
}

/** Coerce all arguments into a single message string. */
function formatMessage(args: unknown[]): string {
  if (args.length === 0) return "";
  return args
    .map((a) => {
      if (a instanceof Error) return a.message;
      if (typeof a === "object") {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

/** Initialize interception. Call once at app startup (e.g. in polyfills). */
export function initConsoleErrorService(): void {
  // Save originals
  originalError = console.error.bind(console);
  originalWarn = console.warn.bind(console);
  originalLog = console.log.bind(console);

  const now = (): string => new Date().toISOString();

  console.error = (...args: unknown[]) => {
    push({
      timestamp: now(),
      level: "error",
      message: formatMessage(args).slice(0, 500),
      stack: extractStack(args)?.slice(0, 1000),
    });
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    push({
      timestamp: now(),
      level: "warn",
      message: formatMessage(args).slice(0, 500),
    });
    originalWarn(...args);
  };

  console.log = (...args: unknown[]) => {
    push({
      timestamp: now(),
      level: "log",
      message: formatMessage(args).slice(0, 500),
    });
    originalLog(...args);
  };
}

/** Return all buffered entries, newest first. */
export function getConsoleErrors(): ConsoleErrorEntry[] {
  return [...buffer].reverse();
}

/** Return count of entries per level. */
export function getConsoleErrorSummary(): { error: number; warn: number; log: number } {
  const counts = { error: 0, warn: 0, log: 0 };
  for (const e of buffer) {
    counts[e.level]++;
  }
  return counts;
}

/** Clear the ring buffer. */
export function clearConsoleErrors(): void {
  buffer.length = 0;
}
