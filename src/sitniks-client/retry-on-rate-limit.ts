const RATE_LIMIT_STATUS = 429;
const MAX_RETRIES = 4;
const BASE_DELAY_MS = 2_000;
const MAX_DELAY_MS = 15_000;

type HttpFailure = { response?: { status?: number; headers?: Record<string, unknown> } };
type RetryOptions = { sleep?: (milliseconds: number) => Promise<void> };

function sleepFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isRateLimited(error: unknown): boolean {
  return (error as HttpFailure | null)?.response?.status === RATE_LIMIT_STATUS;
}

/** Sitniks' own wait hint (seconds) when it sends one. */
function readRetryAfterMs(error: unknown): number | null {
  const seconds = Number((error as HttpFailure).response?.headers?.['retry-after']);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * Sitniks answers "429 too many requests" when several callers (a report, the conflict watcher, other
 * tools on the same key) hit it at once; the rejected request was not executed, so repeating it after a
 * short wait is safe. Without this a burst skipped whole chats in the report (2026-10-15). Other errors
 * are rethrown untouched, and after MAX_RETRIES the 429 itself is rethrown to the caller's own handling.
 */
export async function retryOnRateLimit<Result>(request: () => Promise<Result>, options: RetryOptions = {}): Promise<Result> {
  const sleep = options.sleep ?? sleepFor;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (!isRateLimited(error) || attempt === MAX_RETRIES) throw error;
      await sleep(Math.min(readRetryAfterMs(error) ?? BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS));
    }
  }
}
