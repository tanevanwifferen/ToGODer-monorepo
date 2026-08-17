/**
 * Shared helpers for recognizing the "insufficient balance / out of credits"
 * signal from the backend (an SSE error event, an HTTP 402, or an error whose
 * message mentions insufficient balance) and surfacing a friendly, actionable
 * message instead of a generic "streaming error".
 *
 * The backend attaches `code: 'INSUFFICIENT_BALANCE'` (and HTTP status 402) to
 * these errors. This module is the single source of truth for the client-side
 * detection so both the streaming and non-streaming fallback paths behave the
 * same.
 */

export const INSUFFICIENT_BALANCE_CODE = "INSUFFICIENT_BALANCE";

export const INSUFFICIENT_BALANCE_TOAST_TITLE = "Out of Credits";
export const INSUFFICIENT_BALANCE_TOAST_MESSAGE =
  "Your balance is too low to use this model. Tap to top up.";

/**
 * A friendly, human-readable message used for error state / non-toast surfaces
 * (e.g. the system message shown in the chat).
 */
export const INSUFFICIENT_BALANCE_USER_MESSAGE =
  "You're out of credits. Top up your balance to keep chatting with this model.";

/** Message pattern matching the backend's "Insufficient balance..." errors. */
const INSUFFICIENT_BALANCE_PATTERN = /insufficient\s+balance/i;

/** Extract a string message from an unknown error/event shape. */
function messageOf(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const anyError = error as any;
    if (typeof anyError.message === "string") return anyError.message;
    if (typeof anyError.error === "string") return anyError.error;
  }
  return "";
}

/**
 * True when an error/exception/SSE-event payload indicates insufficient
 * balance: an explicit `code`, an HTTP 402 status, or a matching message.
 */
export function isInsufficientBalanceError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "object") {
    const anyError = error as any;
    if (anyError.code === INSUFFICIENT_BALANCE_CODE) return true;
    if (anyError.status === 402) return true;
  }
  return INSUFFICIENT_BALANCE_PATTERN.test(messageOf(error));
}
