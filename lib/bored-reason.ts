export const MIN_REASON_WORDS = 10;
export const MIN_REASON_CHARS = 50;
export const MAX_REASON_CHARS = 1000;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeReason(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export type ReasonValidation =
  | { ok: true; reason: string }
  | { ok: false; message: string };

export function validateBoredReason(text: string): ReasonValidation {
  const reason = normalizeReason(text);

  if (!reason) {
    return {
      ok: false,
      message: `Write at least ${MIN_REASON_WORDS} words and ${MIN_REASON_CHARS} characters.`,
    };
  }

  if (reason.length > MAX_REASON_CHARS) {
    return {
      ok: false,
      message: `Keep it under ${MAX_REASON_CHARS} characters.`,
    };
  }

  const words = countWords(reason);
  if (reason.length < MIN_REASON_CHARS || words < MIN_REASON_WORDS) {
    return {
      ok: false,
      message: `Need at least ${MIN_REASON_WORDS} words and ${MIN_REASON_CHARS} characters (${words} words, ${reason.length} characters).`,
    };
  }

  return { ok: true, reason };
}

export function isBoredReasonValid(text: string): boolean {
  return validateBoredReason(text).ok;
}
