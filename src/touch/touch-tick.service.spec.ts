import { TouchTickService } from './touch-tick.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';

function chat(id: string): ChatListItem {
  return { id, status: 'Вибір товару', tags: [], lastMessageCreatedAt: new Date().toISOString(), userName: `client-${id}` };
}

type Result = { hasUnansweredTouch: boolean; touched: boolean; noArticle: boolean; noVideo: { chatId: string; clientName: string; article: string }[] };

const NOTHING: Result = { hasUnansweredTouch: false, touched: false, noArticle: false, noVideo: [] };

function build(results: Result[]) {
  const chats = results.map((_, index) => chat(String(index + 1)));
  const list = { listChats: jest.fn().mockResolvedValue({ data: chats, count: chats.length }) };
  const processChat = jest.fn();
  results.forEach((result) => processChat.mockResolvedValueOnce(result));
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const config = { getTouchTargetStatus: () => 'Вибір товару' };
  const service = new TouchTickService(config as never, list as never, { processChat } as never, telegram as never);
  return { service, telegram, processChat };
}

describe('TouchTickService', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] }));
  afterEach(() => jest.useRealTimers());

  async function runTick(service: TouchTickService): Promise<void> {
    const running = service.runTick();
    await jest.runAllTimersAsync();
    await running;
  }

  it('sends the owner ONE message listing every chat that lacks an article or a video', async () => {
    const { service, telegram } = build([
      { ...NOTHING, noArticle: true },
      { ...NOTHING, noVideo: [{ chatId: '2', clientName: 'client-2', article: 'X9999' }] },
      { ...NOTHING, noArticle: true },
    ]);
    await runTick(service);

    expect(telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
    const text = telegram.sendOwnerMessage.mock.calls[0][0] as string;
    expect(text).toContain('client-1');
    expect(text).toContain('client-3');
    expect(text).toContain('X9999');
  });

  it('says nothing when every chat had what it needed', async () => {
    const { service, telegram } = build([NOTHING, { ...NOTHING, touched: true }]);
    await runTick(service);
    expect(telegram.sendOwnerMessage).not.toHaveBeenCalled();
  });

  it('goes on with the other chats when one check fails', async () => {
    const { service, processChat, telegram } = build([NOTHING, { ...NOTHING, noArticle: true }]);
    processChat.mockReset();
    processChat.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ ...NOTHING, noArticle: true });
    await runTick(service);

    expect(processChat).toHaveBeenCalledTimes(2);
    expect(telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
  });
});
