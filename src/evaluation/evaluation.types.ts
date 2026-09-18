import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';
import type { ResponseTimeStats } from './response-time';

/**
 * Result of Claude scoring one chat. `recommendation` alone is written back
 * to the Sitniks note (Sitniks doesn't render HTML) — the rest is for the
 * Telegram report only, where it's formatted with bold labels.
 */
export type ChatEvaluationResult = {
  score: number;
  purchased: boolean | null;
  goodPoints: string;
  closingSummary: string;
  mistakes: string;
  recommendation: string;
  clientConflict: boolean;
};

/** ChatEvaluationResult plus the response-time read — computed in code, not by Claude. */
export type ChatEvaluationOutcome = ChatEvaluationResult & { responseTimes: ResponseTimeStats };

export type EvaluateChatParams = {
  chatId: string;
  existingTags: string[];
  clientName: string;
  managerNames: string[];
  messages: ChatMessage[];
};

/** One evaluated chat's essentials, as input to ClaudeService.synthesizePatterns. */
export type PatternSynthesisInput = {
  clientName: string;
  managerNames: string[];
  score: number;
  mistakes: string;
};

/** Output of ClaudeService.synthesizePatterns — each half formatted with its own label in Telegram. */
export type PatternSynthesisResult = {
  critical: string;
  patterns: string;
};
