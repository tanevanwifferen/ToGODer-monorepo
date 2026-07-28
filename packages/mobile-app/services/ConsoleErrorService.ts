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
  /** error | warn | log | network */
  level: "error" | "warn" | "log" | "network";
  /** First argument coerced to string (truncated for safety) */
  message: string;
  /** stack trace if available (only for Error objects passed to console.error) */
  stack?: string;
}

/** Context for a captured network failure. */
export interface NetworkErrorContext {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Request URL (truncated) */
  url: string;
  /** HTTP status code if available */
  status?: number;
  /** Status text if available */
  statusText?: string;
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
export function getConsoleErrorSummary(): { error: number; warn: number; log: number; network: number } {
  const counts = { error: 0, warn: 0, log: 0, network: 0 };
  for (const e of buffer) {
    if (e.level in counts) {
      counts[e.level as keyof typeof counts]++;
    }
  }
  return counts;
}

/** Clear the ring buffer. */
export function clearConsoleErrors(): void {
  buffer.length = 0;
}

// ── Network error capture ────────────────────────────────────────────

/** Build a compact network error message from context. */
function formatNetworkMessage(ctx: NetworkErrorContext): string {
  const statusPart = ctx.status != null ? `HTTP ${ctx.status} ${ctx.statusText ?? ""}`.trim() : "Network error";
  return `${ctx.method} ${ctx.url} → ${statusPart}`;
}

/** Push a network failure entry (deduplicated by identical message). */
function pushNetworkError(ctx: NetworkErrorContext): void {
  const message = formatNetworkMessage(ctx);
  push({
    timestamp: new Date().toISOString(),
    level: "network",
    message,
  });
}

// ── Fetch interception ───────────────────────────────────────────────

let originalFetch: typeof fetch;

function installFetchInterceptor(): void {
  const g = globalThis as typeof globalThis & { fetch?: typeof fetch };
  if (typeof g.fetch !== "function") return;

  originalFetch = g.fetch.bind(g);

  g.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    let url = "";
    let method = (init?.method ?? "GET").toUpperCase();

    try {
      if (typeof input === "string") {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input instanceof Request) {
        url = input.url;
        if (!init?.method) method = input.method.toUpperCase();
      }

      const response = await originalFetch(input, init);

      if (!response.ok) {
        pushNetworkError({
          method,
          url: url.slice(0, 300),
          status: response.status,
          statusText: response.statusText,
        });
      }

      return response;
    } catch (err) {
      // Network error (e.g. TypeError: Failed to fetch)
      pushNetworkError({
        method,
        url: url.slice(0, 300) || "(unknown URL)",
      });
      throw err;
    }
  };
}

// ── XMLHttpRequest interception ──────────────────────────────────────

let OriginalXHR: typeof XMLHttpRequest;

function installXHRInterceptor(): void {
  const g = globalThis as typeof globalThis & { XMLHttpRequest?: typeof XMLHttpRequest };
  if (typeof g.XMLHttpRequest !== "function") return;

  OriginalXHR = g.XMLHttpRequest;

  // Patch prototype so all instances (including subclasses) are captured
  const proto = OriginalXHR.prototype;
  const originalOpen = proto.open;
  const originalSend = proto.send;

  // Per-instance tracking via WeakMap (no memory leak)
  const requestMap = new WeakMap<XMLHttpRequest, { method: string; url: string }>();

  proto.open = function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    requestMap.set(this, {
      method: method.toUpperCase(),
      url: typeof url === "string" ? url : String(url),
    });
    return (originalOpen as Function).apply(this, [method, url as string, ...rest] as const);
  };

  proto.send = function patchedSend(this: XMLHttpRequest, ...args: unknown[]) {
    const onError = () => {
      const ctx = requestMap.get(this);
      if (ctx) {
        // Only capture if status indicates failure:
        // - 0 means network error / abort (not a real HTTP status)
        // - 4xx or 5xx are failure responses
        const status = this.status;
        if (status === 0 || status >= 400) {
          pushNetworkError({
            method: ctx.method,
            url: ctx.url.slice(0, 300),
            status: status === 0 ? undefined : status,
            statusText: status === 0 ? undefined : this.statusText,
          });
        }
        requestMap.delete(this);
      }
    };

    this.addEventListener("error", onError, { once: true });
    this.addEventListener("abort", onError, { once: true });
    this.addEventListener("timeout", onError, { once: true });
    this.addEventListener("loadend", () => {
      const ctx = requestMap.get(this);
      if (ctx && this.status >= 400) {
        pushNetworkError({
          method: ctx.method,
          url: ctx.url.slice(0, 300),
          status: this.status,
          statusText: this.statusText,
        });
      }
      requestMap.delete(this);
    }, { once: true });

    return (originalSend as Function).apply(this, args as unknown[]);
  };
}

// ── Unhandled rejection capture (optional) ───────────────────────────

function installRejectionHandler(): void {
  const g = globalThis as typeof globalThis & {
    addEventListener?: typeof window.addEventListener;
  };
  if (typeof g.addEventListener !== "function") return;

  g.addEventListener("unhandledrejection", (event: Event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const message =
      reason instanceof Error
        ? `Unhandled rejection: ${reason.message}`
        : `Unhandled rejection: ${String(reason)}`;
    push({
      timestamp: new Date().toISOString(),
      level: "network",
      message: message.slice(0, 500),
      stack: reason instanceof Error ? reason.stack?.slice(0, 1000) : undefined,
    });
  });
}

/**
 * Initialize network error capture (fetch + XHR + unhandled rejections).
 * Call once at app startup, after initConsoleErrorService.
 */
export function initNetworkErrorCapture(): void {
  installFetchInterceptor();
  installXHRInterceptor();
  installRejectionHandler();
}
