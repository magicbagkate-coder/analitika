import { Test } from '@nestjs/testing';
import { ClaudeSuccessService } from '../claude/claude-success.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { TelegramService } from '../telegram/telegram.service';
import { OrderSuccessAnalysisService } from './order-success-analysis.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

function chat(id: string, tags: string[] = []): ChatListItem {
  return { id, status: 'Замовлення створено', tags, lastMessageCreatedAt: new Date().toISOString(), userName: 'u', userNickName: id };
}

function clientMessage(id: string): ChatMessage {
  return { id, sentBy: 'client', text: 'дякую', createdAt: new Date().toISOString(), isViewedByUser: true };
}

describe('OrderSuccessAnalysisService', () => {
  let service: OrderSuccessAnalysisService;
  let chatListService: { listChats: jest.Mock };
  let chatMessagesService: { listMessages: jest.Mock };
  let chatUpdateService: { updateChat: jest.Mock };
  let claudeSuccessService: { analyzeSuccessFactors: jest.Mock; synthesizeSuccessPatterns: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };
  let historyService: { tryRecord: jest.Mock };

  beforeEach(async () => {
    chatListService = { listChats: jest.fn().mockResolvedValue({ data: [], count: 0 }) };
    chatMessagesService = { listMessages: jest.fn() };
    chatUpdateService = { updateChat: jest.fn().mockResolvedValue(undefined) };
    claudeSuccessService = {
      analyzeSuccessFactors: jest.fn(),
      synthesizeSuccessPatterns: jest.fn().mockResolvedValue(''),
    };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    historyService = { tryRecord: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        OrderSuccessAnalysisService,
        { provide: SitniksChatListService, useValue: chatListService },
        { provide: SitniksChatMessagesService, useValue: chatMessagesService },
        { provide: SitniksChatUpdateService, useValue: chatUpdateService },
        { provide: ClaudeSuccessService, useValue: claudeSuccessService },
        { provide: TelegramService, useValue: telegramService },
        { provide: EvaluationHistoryService, useValue: historyService },
      ],
    }).compile();
    service = module.get(OrderSuccessAnalysisService);
  });

  it('sends nothing at all to Telegram when there are no chats to analyze', async () => {
    await service.runAnalysis();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('scores 5 when a confirmed upsell happened, 4 otherwise', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1'), chat('c2')], count: 2 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1')] });
    claudeSuccessService.analyzeSuccessFactors
      .mockResolvedValueOnce({ successFactors: 'допродали аксесуар', hadUpsell: true })
      .mockResolvedValueOnce({ successFactors: 'просто оформили', hadUpsell: false });

    await service.runAnalysis();

    expect(chatUpdateService.updateChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'c1', tags: expect.arrayContaining(['оценка-5']) }));
    expect(chatUpdateService.updateChat).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'c2', tags: expect.arrayContaining(['оценка-4']) }));
  });

  it('records to evaluation_history with source "order_created" and no response-time median', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1')] });
    claudeSuccessService.analyzeSuccessFactors.mockResolvedValue({ successFactors: 'ok', hadUpsell: false });

    await service.runAnalysis();

    expect(historyService.tryRecord).toHaveBeenCalledWith(expect.objectContaining({ source: 'order_created' }));
  });

  it('skips a chat already analyzed against its current latest message', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', ['успіх-аналіз-v2', 'succ-msg-m1'])], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1')] });

    await service.runAnalysis();

    expect(claudeSuccessService.analyzeSuccessFactors).not.toHaveBeenCalled();
  });

  it('does not let one chat failing stop analysis of the rest', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1'), chat('c2')], count: 2 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1')] });
    claudeSuccessService.analyzeSuccessFactors
      .mockRejectedValueOnce(new Error('Claude hiccup'))
      .mockResolvedValueOnce({ successFactors: 'ok', hadUpsell: false });

    await service.runAnalysis();

    expect(claudeSuccessService.analyzeSuccessFactors).toHaveBeenCalledTimes(2);
  });

  it('sends nothing when the batch is fully empty of analyzable chats (all already tagged)', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', ['успіх-аналіз-v2', 'succ-msg-m1'])], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1')] });

    await service.runAnalysis();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });
});
