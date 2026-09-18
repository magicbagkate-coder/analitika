import { Test } from '@nestjs/testing';
import { ClaudeSynthesisService } from '../claude/claude-synthesis.service';
import { ReportRunStatusService } from '../report-run-status/report-run-status.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { TelegramService } from '../telegram/telegram.service';
import { ConflictWatcherService } from './conflict-watcher.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

function chat(id: string, tags: string[] = []): ChatListItem {
  return { id, status: 'Вибір товару', tags, lastMessageCreatedAt: new Date().toISOString(), userName: 'u', userNickName: id };
}

function clientMessage(id: string, text: string): ChatMessage {
  return { id, sentBy: 'client', text, createdAt: new Date().toISOString(), isViewedByUser: true };
}

describe('ConflictWatcherService', () => {
  let service: ConflictWatcherService;
  let chatListService: { listChats: jest.Mock };
  let chatMessagesService: { listMessages: jest.Mock };
  let chatUpdateService: { updateChat: jest.Mock };
  let claudeSynthesisService: { verifyPossibleConflict: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };
  let reportRunStatusService: { isBusy: jest.Mock };

  beforeEach(async () => {
    chatListService = { listChats: jest.fn().mockResolvedValue({ data: [], count: 0 }) };
    chatMessagesService = { listMessages: jest.fn() };
    chatUpdateService = { updateChat: jest.fn().mockResolvedValue(undefined) };
    claudeSynthesisService = { verifyPossibleConflict: jest.fn() };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    reportRunStatusService = { isBusy: jest.fn().mockReturnValue(false) };

    const module = await Test.createTestingModule({
      providers: [
        ConflictWatcherService,
        { provide: SitniksChatListService, useValue: chatListService },
        { provide: SitniksChatMessagesService, useValue: chatMessagesService },
        { provide: SitniksChatUpdateService, useValue: chatUpdateService },
        { provide: ClaudeSynthesisService, useValue: claudeSynthesisService },
        { provide: TelegramService, useValue: telegramService },
        { provide: ReportRunStatusService, useValue: reportRunStatusService },
      ],
    }).compile();
    service = module.get(ConflictWatcherService);
  });

  it('skips the whole cycle — no Sitniks calls at all — while the twice-daily report is running', async () => {
    reportRunStatusService.isBusy.mockReturnValue(true);

    await service.pollAndAlert();

    expect(chatListService.listChats).not.toHaveBeenCalled();
  });

  it('does not call Claude when the latest message has no conflict keyword', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', 'дякую, все добре')] });

    await service.pollAndAlert();

    expect(claudeSynthesisService.verifyPossibleConflict).not.toHaveBeenCalled();
  });

  it('skips a chat whose latest message is from a manager, not the client', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({
      data: [{ id: 'm1', sentBy: 'acct', managerName: 'Аня', text: 'зупиніться', createdAt: new Date().toISOString(), isViewedByUser: true }],
    });

    await service.pollAndAlert();

    expect(claudeSynthesisService.verifyPossibleConflict).not.toHaveBeenCalled();
  });

  it('skips a chat already alerted on this exact message', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1', ['conflict-alert-msg-m1'])], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', 'досить писати мені')] });

    await service.pollAndAlert();

    expect(claudeSynthesisService.verifyPossibleConflict).not.toHaveBeenCalled();
  });

  it('verifies with Claude and sends an alert when a real conflict is confirmed, then tags the chat', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', 'досить писати мені')] });
    claudeSynthesisService.verifyPossibleConflict.mockResolvedValue('Клієнтка просить припинити писати.');

    await service.pollAndAlert();

    expect(telegramService.sendMessage).toHaveBeenCalled();
    expect(chatUpdateService.updateChat).toHaveBeenCalledWith({ chatId: 'c1', tags: ['conflict-alert-msg-m1'] });
  });

  it('does not send an alert when Claude decides the keyword hit was a false positive, but still marks it checked', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1')], count: 1 });
    chatMessagesService.listMessages.mockResolvedValue({ data: [clientMessage('m1', 'прикріпіть скрін товару')] });
    claudeSynthesisService.verifyPossibleConflict.mockResolvedValue('');

    await service.pollAndAlert();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    expect(chatUpdateService.updateChat).toHaveBeenCalledWith({ chatId: 'c1', tags: ['conflict-alert-msg-m1'] });
  });

  it('does not let one chat erroring stop the rest of the poll cycle', async () => {
    chatListService.listChats.mockResolvedValue({ data: [chat('c1'), chat('c2')], count: 2 });
    chatMessagesService.listMessages
      .mockRejectedValueOnce(new Error('Sitniks 500'))
      .mockResolvedValueOnce({ data: [clientMessage('m2', 'досить писати мені')] });
    claudeSynthesisService.verifyPossibleConflict.mockResolvedValue('Реальний конфлікт.');

    await service.pollAndAlert();

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
  });
});
