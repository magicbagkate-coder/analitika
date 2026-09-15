import Anthropic from '@anthropic-ai/sdk';

// The SDK's own default timeout (10 min) combined with its default retries (2) meant one stalled
// request could block an entire report for close to half an hour, and twice in one day (2026-09-14)
// a run genuinely never recovered overnight — something upstream stalled past even that. Every
// Claude call in this project must go through a client with a bounded timeout, so a stall fails
// fast (and gets caught by the caller's try/catch) instead of hanging the whole process.
const REQUEST_TIMEOUT_MS = 90_000;

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS });
}
