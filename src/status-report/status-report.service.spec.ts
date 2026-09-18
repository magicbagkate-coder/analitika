import { Test } from '@nestjs/testing';
import * as fs from 'node:fs/promises';
import { ClaudeSynthesisService } from '../claude/claude-synthesis.service';
import { EvaluationService } from '../evaluation/evaluation.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { TelegramService } from '../telegram/telegram.service';
import { StatusReportService } from './status-report.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';
import type { ChatEvaluationOutcome } from '../evaluation/evaluation.types';

jest.mock('node:fs/promises');

const HOURS_AGO_5 = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();
const MINUTES_AGO_1 = new Date(Date.now() - 60 * 1000).toISOString();

function chat(id: string, overrides: Partial<ChatListItem> = {}): ChatListItem {
  return {
    id,
    status: 'Вибір товару',
    tags: [],
    assignedManagerId: 1,
    lastMessageCreatedAt: HOURS_AGO_5,
    userName: 'user',
    userNickName: id,
    ...overrides,
  };
}

function clientMessage(id: string, createdAt: string): ChatMessage {
  return { id, sentBy: 'client', text: 'hi', createdAt, isViewedByUser: true };
}

function evaluationOutcome(overrides: Partial<ChatEvaluationOutcome> = {}): ChatEvaluationOutcome {
  return {
    score: 4,
    purchased: true,
    goodPoints: 'good',
    closingSummary: 'closed',
    mistakes: 'none',
    recommendation: 'none',
    clientConflict: false,
    responseTimes: { intervalsMinutes: [], medianMinutes: null },
    ...overrides,
  };
}

describe('StatusReportService', () => {
  let service: StatusReportService;
  let chatListService: { listChats: jest.Mock };
  let chatMessagesService: { listMessages: jest.Mock };
  let evaluationService: { evaluateAndPublish: jest.Mock };
  let claudeSynthesisService: { synthesizePatterns: jest.Mock; verifyCriticalChat: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };
  const fsMock = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    chatListService = { listChats: jest.fn().mockResolvedValue({ data: [], count: 0 }) };
    chatMessagesService = { listMessages: jest.fn() };
    evaluationService = { evaluateAndPublish: jest.fn() };
    claudeSynthesisService = {
      synthesizePatterns: jest.fn().mockResolvedValue({ patterns: '', criticalCandidates: [] }),
      verifyCriticalChat: jest.fn().mockResolvedValue(''),
    };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    fsMock.mkdir.mockResolvedValue(undefined as unknown as string);
    fsMock.writeFile.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        StatusReportService,
        { provide: SitniksChatListService, useValue: chatListService },
        { provide: SitniksChatMessagesService, useValue: chatMessagesService },
        { provide: EvaluationService, useValue: evaluationService },
        { provide: ClaudeSynthesisService, useValue: claudeSynthesisService },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();
    service = module.get(StatusReportService);
  });

  it('skips a chat with no assigned manager entirely', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', { assignedManagerId: null })], count: 1 });

    await service.runReport();

    expect(chatMessagesService.listMessages).not.toHaveBeenCalled();
    expect(evaluationService.evaluateAndPublish).not.toHaveBeenCalled();
  });

  it('skips a chat still active (not quiet long enough)', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', { lastMessageCreatedAt: MINUTES_AGO_1 })], count: 1 });

    await service.runReport();

    expect(evaluationService.evaluateAndPublish).not.toHaveBeenCalled();
  });

  it('skips a chat with no messages at all', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [] });

    await service.runReport();

    expect(evaluationService.evaluateAndPublish).not.toHaveBeenCalled();
  });

  it('skips a chat already scored against its current latest message (needsEvaluation = false)', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', { tags: ['оценка-4', 'msg-m1'] })], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', HOURS_AGO_5)] });

    await service.runReport();

    expect(evaluationService.evaluateAndPublish).not.toHaveBeenCalled();
  });

  it('evaluates a fresh chat and sends its block to Telegram', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', HOURS_AGO_5)] });
    evaluationService.evaluateAndPublish.mockResolvedValue(evaluationOutcome());

    await service.runReport();

    expect(evaluationService.evaluateAndPublish).toHaveBeenCalledTimes(1);
    const chatBlockSent = telegramService.sendMessage.mock.calls.some(([text]) => text.includes('c1'));
    expect(chatBlockSent).toBe(true);
  });

  it('does not let one chat failing stop evaluation of the rest', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1'), chat('c2')], count: 2 });
    chatMessagesService.listMessages
      .mockResolvedValueOnce({ data: [clientMessage('m1', HOURS_AGO_5)] })
      .mockResolvedValueOnce({ data: [clientMessage('m2', HOURS_AGO_5)] });
    evaluationService.evaluateAndPublish
      .mockRejectedValueOnce(new Error('Claude hiccup'))
      .mockResolvedValueOnce(evaluationOutcome());

    await service.runReport();

    expect(evaluationService.evaluateAndPublish).toHaveBeenCalledTimes(2);
  });

  it('always includes a clientConflict chat among critical candidates, even if the synthesis call misses it', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', HOURS_AGO_5)] });
    evaluationService.evaluateAndPublish.mockResolvedValue(evaluationOutcome({ clientConflict: true }));
    claudeSynthesisService.synthesizePatterns.mockResolvedValue({ patterns: '', criticalCandidates: [] });
    claudeSynthesisService.verifyCriticalChat.mockResolvedValue('Клієнтка незадоволена спілкуванням.');

    await service.runReport();

    expect(claudeSynthesisService.verifyCriticalChat).toHaveBeenCalledWith('c1', expect.anything(), true);
  });

  it('skips the attention block entirely when nothing critical or repeating this run', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', HOURS_AGO_5)] });
    evaluationService.evaluateAndPublish.mockResolvedValue(evaluationOutcome());

    await service.runReport();

    const attentionSent = telegramService.sendMessage.mock.calls.some(([text]) => text.includes('На что обратить внимание'));
    expect(attentionSent).toBe(false);
  });

  it('paginates through the full chat list when there are more pages than the page size', async () => {
    // Every chat here skips evaluation instantly (no manager assigned), but the real per-item
    // delay in evaluateAll still applies to each of the 50 — fake timers so this stays fast.
    jest.useFakeTimers();
    const page1 = Array.from({ length: 50 }, (_, i) => chat(`p1-${i}`, { assignedManagerId: null }));
    const page2 = [chat('p2-0', { assignedManagerId: null })];
    chatListService.listChats.mockResolvedValueOnce({ data: page1, count: 51 }).mockResolvedValueOnce({ data: page2, count: 51 });

    const reportPromise = service.runReport();
    await jest.runAllTimersAsync();
    await reportPromise;

    expect(chatListService.listChats).toHaveBeenCalledTimes(2);
    jest.useRealTimers();
  });
});
