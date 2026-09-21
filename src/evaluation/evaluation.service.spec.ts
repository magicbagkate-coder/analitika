import { Test } from '@nestjs/testing';
import { ClaudeService } from '../claude/claude.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { ReplyTimesService } from '../reply-times/reply-times.service';
import { SitniksChatNotesService } from '../sitniks-chat-notes/sitniks-chat-notes.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { EvaluationService } from './evaluation.service';
import type { ChatEvaluationResult } from './evaluation.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

function evaluationResult(overrides: Partial<ChatEvaluationResult> = {}): ChatEvaluationResult {
  return {
    score: 4,
    purchased: true,
    goodPoints: 'Швидко відповіла',
    closingSummary: 'Оформили замовлення',
    mistakes: 'Немає',
    recommendation: 'Немає',
    clientConflict: false,
    ...overrides,
  };
}

function messageAt(id: string, sentBy: string, managerName: string | undefined, createdAt: string): ChatMessage {
  return { id, sentBy, managerName, text: 'text', createdAt, isViewedByUser: true };
}

describe('EvaluationService', () => {
  let service: EvaluationService;
  let claudeService: { evaluateChat: jest.Mock };
  let notesService: { createNote: jest.Mock };
  let updateService: { updateChat: jest.Mock };
  let historyService: { tryRecord: jest.Mock };
  let replyTimesService: { queue: jest.Mock };

  beforeEach(async () => {
    claudeService = { evaluateChat: jest.fn().mockResolvedValue(evaluationResult()) };
    notesService = { createNote: jest.fn().mockResolvedValue(undefined) };
    updateService = { updateChat: jest.fn().mockResolvedValue(undefined) };
    historyService = { tryRecord: jest.fn().mockResolvedValue(undefined) };
    replyTimesService = { queue: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EvaluationService,
        { provide: ClaudeService, useValue: claudeService },
        { provide: SitniksChatNotesService, useValue: notesService },
        { provide: SitniksChatUpdateService, useValue: updateService },
        { provide: EvaluationHistoryService, useValue: historyService },
        { provide: ReplyTimesService, useValue: replyTimesService },
      ],
    }).compile();
    service = module.get(EvaluationService);
  });

  const baseMessages: ChatMessage[] = [
    messageAt('2', 'mgr', 'Аня', '2026-09-18T10:05:00.000Z'),
    messageAt('1', 'client', undefined, '2026-09-18T10:00:00.000Z'),
  ];

  it('replaces the score and last-evaluated-message tags, stripping any previous ones', async () => {
    await service.evaluateAndPublish({
      chatId: 'abc',
      existingTags: ['оценка-2', 'msg-old', 'важливий'],
      clientName: 'test_client',
      managerNames: ['Аня'],
      messages: baseMessages,
    });

    expect(updateService.updateChat).toHaveBeenCalledWith({
      chatId: 'abc',
      tags: ['важливий', 'оценка-4', 'msg-2'],
    });
  });

  it('writes only the recommendation to the Sitniks note, not the full analysis', async () => {
    claudeService.evaluateChat.mockResolvedValue(evaluationResult({ recommendation: 'Запропонувати аксесуар' }));

    await service.evaluateAndPublish({
      chatId: 'abc',
      existingTags: [],
      clientName: 'test_client',
      managerNames: ['Аня'],
      messages: baseMessages,
    });

    expect(notesService.createNote).toHaveBeenCalledWith({ chatId: 'abc', note: 'Запропонувати аксесуар' });
  });

  it('records the evaluation and the computed median response time to history', async () => {
    await service.evaluateAndPublish({
      chatId: 'abc',
      existingTags: [],
      clientName: 'test_client',
      managerNames: ['Аня'],
      messages: baseMessages,
    });

    expect(historyService.tryRecord).toHaveBeenCalledWith({
      chatId: 'abc',
      clientName: 'test_client',
      managerNames: ['Аня'],
      score: 4,
      source: 'product_selection',
      note: 'Немає',
      medianResponseMinutes: 5,
    });
  });

  it('records each manager reply separately, with who gave it, so speed can be read per manager', async () => {
    await service.evaluateAndPublish({
      chatId: 'abc',
      existingTags: [],
      clientName: 'test_client',
      managerNames: ['Аня'],
      messages: baseMessages,
    });

    expect(replyTimesService.queue).toHaveBeenCalledWith({
      chatId: 'abc',
      source: 'product_selection',
      replies: [expect.objectContaining({ messageId: '2', managerName: 'Аня', minutes: 5 })],
    });
  });

  it('returns the Claude evaluation merged with the computed response times', async () => {
    const result = await service.evaluateAndPublish({
      chatId: 'abc',
      existingTags: [],
      clientName: 'test_client',
      managerNames: ['Аня'],
      messages: baseMessages,
    });

    expect(result.score).toBe(4);
    expect(result.responseTimes).toEqual({ intervalsMinutes: [5], medianMinutes: 5 });
  });

  it('does not let a failed note-write break the rest of the flow', async () => {
    notesService.createNote.mockRejectedValue(new Error('Sitniks 403'));

    await expect(
      service.evaluateAndPublish({
        chatId: 'abc',
        existingTags: [],
        clientName: 'test_client',
        managerNames: ['Аня'],
        messages: baseMessages,
      }),
    ).resolves.toBeDefined();

    expect(historyService.tryRecord).toHaveBeenCalled();
  });
});
