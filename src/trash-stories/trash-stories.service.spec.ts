import { Test } from '@nestjs/testing';
import { ClaudeTrashStoriesService } from '../claude/claude-trash-stories.service';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatMessagesService } from '../sitniks-chat-messages/sitniks-chat-messages.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { TelegramService } from '../telegram/telegram.service';
import { TrashStoriesService } from './trash-stories.service';

const recent = (): string => new Date(Date.now() - 60 * 60 * 1000).toISOString();
const chat = (overrides: Record<string, unknown>) => ({ id: 'c1', status: 'Повернення', tags: [], lastMessageCreatedAt: recent(), userName: 'Anna', ...overrides });
const message = (text: string, id = 'm1', managerName?: string) => ({ id, text, managerName, sentBy: 's', createdAt: recent(), isViewedByUser: true });

describe('TrashStoriesService.runStories', () => {
  let service: TrashStoriesService;
  let chatsByStatus: Record<string, unknown[]>;
  let messagesByChat: Record<string, unknown[]>;
  let listChats: jest.Mock;
  let listMessages: jest.Mock;
  let updateChat: jest.Mock;
  let assessChat: jest.Mock;
  let sendMessage: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    chatsByStatus = {};
    messagesByChat = {};
    listChats = jest.fn().mockImplementation(async ({ status }) => ({ data: chatsByStatus[status] ?? [] }));
    listMessages = jest.fn().mockImplementation(async ({ chatId }) => ({ data: messagesByChat[chatId] ?? [] }));
    updateChat = jest.fn().mockResolvedValue(undefined);
    assessChat = jest.fn().mockResolvedValue({ isTrashStory: true, category: 'претензия', summary: 'Клиентка требует возврат.' });
    sendMessage = jest.fn().mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        TrashStoriesService,
        { provide: SitniksChatListService, useValue: { listChats } },
        { provide: SitniksChatMessagesService, useValue: { listMessages } },
        { provide: SitniksChatUpdateService, useValue: { updateChat } },
        { provide: ClaudeTrashStoriesService, useValue: { assessChat } },
        { provide: TelegramService, useValue: { sendMessage } },
      ],
    }).compile();
    service = module.get(TrashStoriesService);
  });

  afterEach(() => jest.useRealTimers());

  async function run(): Promise<void> {
    const promise = service.runStories(new Date());
    await jest.runAllTimersAsync();
    await promise;
  }

  it('judges every chat in the returns status and sends the story under the "Трэш истории" title', async () => {
    chatsByStatus['Повернення'] = [chat({})];
    messagesByChat.c1 = [message('Верну сумку')];

    await run();

    expect(assessChat).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toContain('Трэш истории');
    expect(sendMessage.mock.calls[0][0]).toContain('Клиентка требует возврат.');
  });

  it('does not call Claude for an ordinary "Вибір товару" chat — the keyword pre-filter stops it', async () => {
    chatsByStatus['Вибір товару'] = [chat({ id: 'c2', status: 'Вибір товару' })];
    messagesByChat.c2 = [message('Яка ціна?')];

    await run();

    expect(assessChat).not.toHaveBeenCalled();
  });

  it('still sends the block after a shift with nothing found, saying so', async () => {
    await run();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toContain('Трэш историй за эту смену не найдено');
  });

  it('sends a "Вибір товару" chat with a claim keyword to Claude', async () => {
    chatsByStatus['Вибір товару'] = [chat({ id: 'c2', status: 'Вибір товару' })];
    messagesByChat.c2 = [message('Це брак, напишу скаргу')];

    await run();

    expect(assessChat).toHaveBeenCalledTimes(1);
  });

  it('skips a chat whose newest message was already judged', async () => {
    chatsByStatus['Повернення'] = [chat({ tags: ['trash-msg-m1'] })];
    messagesByChat.c1 = [message('Верну сумку', 'm1')];

    await run();

    expect(assessChat).not.toHaveBeenCalled();
  });

  it('skips a chat with no message inside the lookback window', async () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    chatsByStatus['Повернення'] = [chat({ lastMessageCreatedAt: old })];

    await run();

    expect(listMessages).not.toHaveBeenCalled();
  });

  it('marks a judged chat with a tag and keeps its other tags', async () => {
    chatsByStatus['Повернення'] = [chat({ tags: ['оценка-4', 'trash-msg-old'] })];
    messagesByChat.c1 = [message('Верну сумку', 'm5')];

    await run();

    expect(updateChat).toHaveBeenCalledWith({ chatId: 'c1', tags: ['оценка-4', 'trash-msg-m5'] });
  });

  it('marks a chat Claude rejected too, so it is not judged again until something new arrives', async () => {
    assessChat.mockResolvedValue({ isTrashStory: false, category: 'другое', summary: '' });
    chatsByStatus['Повернення'] = [chat({})];
    messagesByChat.c1 = [message('Дякую')];

    await run();

    expect(updateChat).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][0]).toContain('не найдено');
  });

  it('one failing chat does not stop the others, and she gets a warning about it', async () => {
    chatsByStatus['Повернення'] = [chat({ id: 'bad' }), chat({ id: 'good' })];
    messagesByChat.bad = [message('Верну', 'm1')];
    messagesByChat.good = [message('Верну', 'm2')];
    assessChat.mockRejectedValueOnce(new Error('Claude down'));

    await run();

    const texts = sendMessage.mock.calls.map(([text]) => text);
    expect(texts.some((text) => text.includes('Трэш истории</b>') && text.includes('<b>Anna</b>'))).toBe(true);
    expect(texts.some((text) => text.includes('не удалось обработать 1 из 2 чатов'))).toBe(true);
  });

  it('never throws when Sitniks fails to list chats, but warns in Telegram', async () => {
    listChats.mockRejectedValue(new Error('429'));

    await expect(run()).resolves.toBeUndefined();

    expect(sendMessage.mock.calls[0][0]).toContain('блок не сформирован');
  });
});
