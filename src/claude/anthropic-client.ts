import Anthropic from '@anthropic-ai/sdk';

// The SDK's own default timeout (10 min) combined with its default retries (2) meant one stalled
// request could block an entire report for close to half an hour, and twice in one day (2026-09-14)
// a run genuinely never recovered overnight — something upstream stalled past even that. Every
// Claude call in this project must go through a client with a bounded timeout, so a stall fails
// fast (and gets caught by the caller's try/catch) instead of hanging the whole process.
const REQUEST_TIMEOUT_MS = 90_000;

// Independent of REQUEST_TIMEOUT_MS — a second, outer bound applied via withHardTimeout below.
// 2026-09-18: a manager-characteristics call hung for 49 minutes despite the 90s client timeout —
// something below the SDK (a stalled socket the abort didn't actually tear down) never aborted it.
// This doesn't trust that mechanism alone; it's a plain setTimeout the SDK has no part in.
const HARD_TIMEOUT_MS = 120_000;

export function createAnthropicClient(apiKey: string): Anthropic {
  // maxRetries: 0 — every caller already treats one failed call as "skip this item, move on" (see
  // each service's own try/catch), so an automatic SDK retry only adds unpredictable extra time on
  // top of an already-bounded timeout, without giving any caller here a benefit it doesn't already
  // get from its own batch-level resilience.
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
}

/**
 * Wraps any Claude call with a hard time bound that doesn't depend on the SDK's own timeout
 * mechanism working correctly. Always attaches both a resolve and a reject handler directly to the
 * real promise (never discards it) — so if `promise` settles after the timer already "lost" the
 * race, that late settle finds an already-resolved outer promise and is a harmless no-op, not an
 * unhandled rejection. This is the specific failure mode report-watchdog.ts's own comment documents
 * from 2026-09-15 (a bare `.finally()` on an orphaned promise, no reject handler, crashed the whole
 * process) — this function structurally can't repeat it.
 */
export function withHardTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} exceeded hard ${HARD_TIMEOUT_MS / 1000}s timeout`));
    }, HARD_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
