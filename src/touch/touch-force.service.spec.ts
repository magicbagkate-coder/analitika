import { TouchForceService } from './touch-force.service';

const DETAILS = { id: 'c1', status: 'Вибір товару', tags: [], assignedManagerId: null, clientId: null, userName: 'Іра', initialSource: 'instagram' };

function build(params: { attempt: object | null; result?: object }) {
  const log = { findById: jest.fn().mockResolvedValue(params.attempt) };
  const chats = { getChat: jest.fn().mockResolvedValue(DETAILS) };
  const chat = { processChat: jest.fn().mockResolvedValue({ hasUnansweredTouch: false, touched: true, noArticle: false, noVideo: [], skipped: null, ...params.result }) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const service = new TouchForceService(log as never, chats as never, chat as never, telegram as never);
  return { service, chat, telegram };
}

const SKIPPED = { chatId: 'c1', clientName: 'Іра', state: 'skipped' };
const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('TouchForceService', () => {
  it('answers the button at once and prepares the touch against the bot\'s own decision', async () => {
    const { service, chat, telegram } = build({ attempt: SKIPPED });
    expect(await service.forceTouch('a1')).toBe('Готовлю касание…');
    await settle();

    expect(chat.processChat).toHaveBeenCalledWith(expect.objectContaining({ pass: 'morning', force: true, chat: expect.objectContaining({ id: 'c1', initialSource: 'instagram' }) }));
    expect(telegram.sendOwnerMessage).not.toHaveBeenCalled();
  });

  it('does nothing for a touch that is no longer skipped', async () => {
    const { service, chat } = build({ attempt: { ...SKIPPED, state: 'sent' } });
    expect(await service.forceTouch('a1')).toBe('Уже обработано');
    expect(chat.processChat).not.toHaveBeenCalled();
  });

  it('answers "not found" for an unknown touch', async () => {
    expect(await build({ attempt: null }).service.forceTouch('zzz')).toBe('Не найдено');
  });

  it('tells the owner why when nothing could be prepared', async () => {
    const { service, telegram } = build({ attempt: SKIPPED, result: { touched: false, noArticle: true } });
    await service.forceTouch('a1');
    await settle();
    expect(telegram.sendOwnerMessage).toHaveBeenCalledWith(expect.stringContaining('нет заметки с артикулом'));
  });
});
