import { TouchMorningService } from './touch-morning.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

// "Now" is 08:05 Kyiv on 25.11.2026 (06:05Z): the cutoff is 22:00 Kyiv on 24.11 = 20:00Z.
const NOW = new Date('2026-11-25T06:05:00.000Z');

function chat(id: string, lastMessageAt: string): ChatListItem {
  return { id, status: 'Вибір товару', tags: [], lastMessageCreatedAt: lastMessageAt, userName: id };
}

function build(params: { chats: ChatListItem[]; mode: 'live' | 'dry-run'; processResult?: object }) {
  const list = { listChats: jest.fn().mockResolvedValue({ data: params.chats, count: params.chats.length }) };
  const status = { changeStatus: jest.fn().mockResolvedValue(undefined) };
  const chatService = { processChat: jest.fn().mockResolvedValue({ hasUnansweredTouch: false, touched: false, noArticle: false, noVideo: [], skipped: null, ...params.processResult }) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const config = { getTouchMode: () => params.mode, getTouchTargetStatus: () => 'Вибір товару', getTouchClosedStatus: () => 'Завершено' };
  const service = new TouchMorningService(config as never, list as never, status as never, chatService as never, telegram as never);
  return { service, status, chatService, telegram };
}

describe('TouchMorningService', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['setTimeout', 'setImmediate', 'nextTick'] });
  });
  afterEach(() => jest.useRealTimers());

  it('closes chats whose last message came before 22:00 and keeps the later ones', async () => {
    const { service, status, chatService } = build({
      mode: 'live',
      chats: [chat('old', '2026-11-24T19:59:00.000Z'), chat('late', '2026-11-24T20:30:00.000Z')],
    });
    await service.runMorningPass();

    expect(status.changeStatus).toHaveBeenCalledTimes(1);
    expect(status.changeStatus).toHaveBeenCalledWith({ chatId: 'old', status: 'Завершено' });
    expect(chatService.processChat).toHaveBeenCalledTimes(1);
    expect(chatService.processChat).toHaveBeenCalledWith({ chat: expect.objectContaining({ id: 'late' }), pass: 'morning' });
  });

  it('also closes a late chat whose touch already went out and was not answered', async () => {
    const { service, status } = build({ mode: 'live', chats: [chat('late', '2026-11-24T21:00:00.000Z')], processResult: { hasUnansweredTouch: true } });
    await service.runMorningPass();
    expect(status.changeStatus).toHaveBeenCalledWith({ chatId: 'late', status: 'Завершено' });
  });

  it('changes nothing in a dry run and only reports the numbers', async () => {
    const { service, status, telegram } = build({ mode: 'dry-run', chats: [chat('old', '2026-11-24T10:00:00.000Z')] });
    await service.runMorningPass();

    expect(status.changeStatus).not.toHaveBeenCalled();
    expect(telegram.sendOwnerMessage).toHaveBeenCalledWith(expect.stringContaining('Проба'));
  });

  it('counts a chat that could not be closed instead of stopping', async () => {
    const { service, status, telegram } = build({ mode: 'live', chats: [chat('a', '2026-11-24T10:00:00.000Z'), chat('b', '2026-11-24T11:00:00.000Z')] });
    status.changeStatus.mockRejectedValueOnce(new Error('boom'));
    await service.runMorningPass();

    expect(status.changeStatus).toHaveBeenCalledTimes(2);
    expect(telegram.sendOwnerMessage).toHaveBeenCalledWith(expect.stringContaining('ошибок: 1'));
  });
});
