import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ClaudeSynthesisService } from '../claude/claude-synthesis.service';
import { collectManagerNames } from '../claude/manager-context';
import { EvaluationService } from '../evaluation/evaluation.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { TelegramService } from '../telegram/telegram.service';
import { ANALYSIS_WINDOW_HOURS, TARGET_STATUS, filterToRecentWindow, needsEvaluation } from '../evaluation/evaluation.constants';
import { getKyivHourMinute } from '../kyiv-time';
import { formatAttentionBlock, formatChatBlock, formatSummaryBlock } from './status-report-formatter';
import { QUIET_HOURS_BEFORE_EVALUATING } from './status-report.constants';
import type { PatternSynthesisResult } from '../evaluation/evaluation.types';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';
import type { ChatOutcome } from './status-report.types';

const DELAY_BETWEEN_REQUESTS_MS = 1500;
const PAGE_SIZE = 50;
const LOST_THRESHOLD_MINUTES = 20;
const REPORTS_DIR = join(process.cwd(), 'reports');

/**
 * Snapshots every chat currently in TARGET_STATUS: evaluates each one that's new or has new
 * messages since its last score (see needsEvaluation), sends the full per-chat analysis to
 * Telegram (one chat per message — file/website tags alone don't show WHY a score was given), plus
 * a per-manager aggregate, and writes everything to a local file too. Scheduling (twice a day,
 * strictly after OrderSuccessAnalysisService — owner's instruction, 2026-09-15, so the two reports
 * never interleave) lives in ReportSchedulerService, not here — this service only runs on demand.
 */
@Injectable()
export class StatusReportService {
  private readonly logger = new Logger(StatusReportService.name);

  constructor(
    private readonly sitniksChatListService: SitniksChatListService,
    private readonly sitniksChatMessagesService: SitniksChatMessagesService,
    private readonly evaluationService: EvaluationService,
    private readonly claudeSynthesisService: ClaudeSynthesisService,
    private readonly telegramService: TelegramService,
  ) {}

  async runReport(): Promise<void> {
    const chats = await this.fetchChatsInStatus();
    const outcomes = await this.evaluateAll(chats);
    const patterns = await this.trySynthesizePatterns(outcomes);

    const filePath = await this.writeReportFile(chats.length, outcomes, patterns);
    this.logger.log(`Status report written to ${filePath}`);
    await this.sendReportToTelegram(chats.length, outcomes, patterns);
  }

  /**
   * A synthesis-call hiccup shouldn't drop the rest of an otherwise-complete report. Chats where
   * Claude flagged clientConflict (evaluation.ts) are unioned into the candidate list here in code —
   * owner's rule (2026-09-15): any client complaint/irritation about the communication is 100%
   * reported, not left to the synthesis LLM's discretion on whether it's worth including.
   */
  private async trySynthesizePatterns(outcomes: ChatOutcome[]): Promise<PatternSynthesisResult> {
    const conflictNames = outcomes.filter((outcome) => outcome.clientConflict).map((outcome) => outcome.clientName);
    try {
      const draft = await this.claudeSynthesisService.synthesizePatterns(outcomes);
      const candidateNames = Array.from(new Set([...draft.criticalCandidates, ...conflictNames]));
      this.logger.log(
        `Synthesis draft: ${draft.patterns.length} chars of patterns, ${candidateNames.length} critical candidates` +
          ` (${conflictNames.length} guaranteed by client-conflict rule)`,
      );
      const critical = await this.verifyCriticalCandidates(candidateNames, outcomes, new Set(conflictNames));
      return { critical, patterns: draft.patterns };
    } catch (error) {
      this.logger.warn(`Could not synthesize patterns: ${(error as Error).message}`);
      // Even a synthesis-call failure must not silently drop a confirmed client conflict.
      const critical = await this.verifyCriticalCandidates(conflictNames, outcomes, new Set(conflictNames));
      return { critical, patterns: '' };
    }
  }

  /** Nothing is reported as "critical" without re-reading its full dialog first — see ClaudeSynthesisService. */
  private async verifyCriticalCandidates(
    candidateNames: string[],
    outcomes: ChatOutcome[],
    guaranteedNames: Set<string>,
  ): Promise<string> {
    const confirmed: string[] = [];

    for (const name of candidateNames) {
      const description = await this.tryVerifyOneCandidate(name, outcomes, guaranteedNames.has(name));
      if (description.length > 0) confirmed.push(description);
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return confirmed.join(' ');
  }

  /**
   * One candidate's Sitniks/Claude hiccup shouldn't drop verification for the rest. For a guaranteed
   * client conflict, a hiccup still can't drop it from the report — falls back to the mistakes text
   * already captured during evaluation instead of an empty string.
   */
  private async tryVerifyOneCandidate(name: string, outcomes: ChatOutcome[], guaranteedConflict: boolean): Promise<string> {
    const outcome = outcomes.find((candidate) => candidate.clientName === name);
    if (!outcome) return '';

    try {
      const messagesResponse = await this.sitniksChatMessagesService.listMessages({ chatId: outcome.chatId, limit: 50 });
      const description = await this.claudeSynthesisService.verifyCriticalChat(name, messagesResponse.data, guaranteedConflict);
      return description.length > 0 ? description : this.fallbackConflictLine(outcome, guaranteedConflict);
    } catch (error) {
      this.logger.warn(`Could not verify critical candidate ${name}: ${(error as Error).message}`);
      return this.fallbackConflictLine(outcome, guaranteedConflict);
    }
  }

  /** Guarantees the client-conflict rule survives a Claude/Sitniks hiccup, using the mistakes text already on hand. */
  private fallbackConflictLine(outcome: ChatOutcome, guaranteedConflict: boolean): string {
    if (!guaranteedConflict) return '';
    return `${outcome.clientName} — конфликт с клиентом: ${outcome.mistakes}`;
  }

  /**
   * One message per newly evaluated chat (with the full analysis), then the ИТОГ summary, then —
   * as its own separate message, per the owner's explicit instruction (2026-09-14) — "На что
   * обратить внимание" (skipped entirely if there's nothing critical or repeating this run).
   */
  private async sendReportToTelegram(
    totalFound: number,
    outcomes: ChatOutcome[],
    patterns: PatternSynthesisResult,
  ): Promise<void> {
    await this.trySendToTelegram(`Снимок статуса "${TARGET_STATUS}" — ${new Date().toISOString()}`);
    for (const outcome of outcomes) {
      await this.trySendToTelegram(formatChatBlock(outcome));
    }
    await this.trySendToTelegram(formatSummaryBlock(totalFound, outcomes));

    const attentionBlock = formatAttentionBlock(this.formatReportTime(), totalFound, patterns);
    if (attentionBlock.length > 0) await this.trySendToTelegram(attentionBlock);
  }

  /** "HH:MM" in Kyiv time, e.g. "15:45" — matches the scheduled REPORT_TIMES entries regardless of host timezone. */
  private formatReportTime(): string {
    const { hour, minute } = getKyivHourMinute();
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }

  /** Telegram isn't configured yet on every deployment — don't let that break the file report. */
  private async trySendToTelegram(text: string): Promise<void> {
    try {
      await this.telegramService.sendMessage(text);
    } catch (error) {
      this.logger.warn(`Could not send status report to Telegram: ${(error as Error).message}`);
    }
  }

  private async fetchChatsInStatus(): Promise<ChatListItem[]> {
    const all: ChatListItem[] = [];
    let skip = 0;

    for (;;) {
      const response = await this.sitniksChatListService.listChats({ status: TARGET_STATUS, skip, limit: PAGE_SIZE });
      all.push(...response.data);
      if (response.data.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return all;
  }

  private async evaluateAll(chats: ChatListItem[]): Promise<ChatOutcome[]> {
    const outcomes: ChatOutcome[] = [];

    for (const chat of chats) {
      const outcome = await this.tryEvaluateOneChat(chat);
      if (outcome) outcomes.push(outcome);
      await this.delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    return outcomes;
  }

  /** One chat's failure (Sitniks/Claude error) shouldn't stop the rest of the snapshot. */
  private async tryEvaluateOneChat(chat: ChatListItem): Promise<ChatOutcome | null> {
    try {
      return await this.evaluateOneChat(chat);
    } catch (error) {
      this.logger.warn(`Could not evaluate chat ${chat.id}: ${(error as Error).message}`);
      return null;
    }
  }

  private async evaluateOneChat(chat: ChatListItem): Promise<ChatOutcome | null> {
    if (chat.assignedManagerId === undefined || chat.assignedManagerId === null) return null;
    if (!this.isQuietLongEnough(chat)) return null;

    const messagesResponse = await this.sitniksChatMessagesService.listMessages({ chatId: chat.id, limit: 50 });
    if (messagesResponse.data.length === 0) return null;
    if (!needsEvaluation(chat.tags, messagesResponse.data[0]?.id)) return null;

    const recentMessages = filterToRecentWindow(messagesResponse.data, ANALYSIS_WINDOW_HOURS);
    const clientName = chat.userNickName ?? chat.userName;
    const managerNames = collectManagerNames(recentMessages);
    const evaluation = await this.evaluationService.evaluateAndPublish({
      chatId: chat.id,
      existingTags: chat.tags,
      clientName,
      managerNames,
      messages: recentMessages,
    });
    return {
      chatId: chat.id,
      clientName,
      managerNames,
      score: evaluation.score,
      purchased: evaluation.purchased,
      goodPoints: evaluation.goodPoints,
      closingSummary: evaluation.closingSummary,
      mistakes: evaluation.mistakes,
      recommendation: evaluation.recommendation,
      isLost: this.isLost(messagesResponse.data),
      clientConflict: evaluation.clientConflict,
      responseTimes: evaluation.responseTimes,
    };
  }

  /**
   * Lost = last message is from the client (no managerName) AND it's been sitting unanswered
   * for at least LOST_THRESHOLD_MINUTES — a client who wrote 5 minutes ago isn't "lost" yet.
   * messages is newest-first (Sitniks API order) — [0] is the actual last message, not [length - 1].
   */
  private isLost(messages: ChatMessage[]): boolean {
    const latestMessage = messages[0];
    if (!latestMessage || latestMessage.managerName) return false;

    const minutesSinceLastMessage = (Date.now() - new Date(latestMessage.createdAt).getTime()) / (60 * 1000);
    return minutesSinceLastMessage >= LOST_THRESHOLD_MINUTES;
  }


  /** Skip chats still being actively worked — judge only ones that have gone quiet. */
  private isQuietLongEnough(chat: ChatListItem): boolean {
    const quietSinceMs = Date.now() - new Date(chat.lastMessageCreatedAt).getTime();
    return quietSinceMs >= QUIET_HOURS_BEFORE_EVALUATING * 60 * 60 * 1000;
  }

  private async writeReportFile(
    totalFound: number,
    outcomes: ChatOutcome[],
    patterns: PatternSynthesisResult,
  ): Promise<string> {
    await mkdir(REPORTS_DIR, { recursive: true });

    const now = new Date();
    const stamp = `${now.toISOString().slice(0, 10)}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const filePath = join(REPORTS_DIR, `status-report-${stamp}.txt`);
    const blocks = outcomes.map((outcome) => formatChatBlock(outcome));
    const attentionBlock = formatAttentionBlock(this.formatReportTime(), totalFound, patterns);
    const content = [
      `Снимок статуса "${TARGET_STATUS}" — ${now.toISOString()}`,
      '',
      ...blocks,
      formatSummaryBlock(totalFound, outcomes),
      attentionBlock,
    ]
      .filter((section) => section.length > 0)
      .join('\n\n');
    await writeFile(filePath, content, 'utf-8');

    return filePath;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
