import { splitSheetLinks, renderTelegramLinks } from './chat-link-render';
import { buildChatMarker, numberChatMarkers, resolveChatNumbers } from './chat-refs';

const FIRST_CHAT = '6aaa09fe47aa80b7b467f374';
const SECOND_CHAT = '6ad617c8732e2cd7404d319b';

describe('resolveChatNumbers', () => {
  it('turns numbers into chat markers, also when several are listed in one bracket', () => {
    const text = resolveChatNumbers({ text: 'Задержка 51 минута [#1] [#2, #1]', chatIds: [FIRST_CHAT, SECOND_CHAT] });
    expect(text).toBe(`Задержка 51 минута ${buildChatMarker(FIRST_CHAT)} ${buildChatMarker(SECOND_CHAT)}`);
  });

  it('still finds the number when Claude adds words in the bracket', () => {
    expect(resolveChatNumbers({ text: 'Задержка [#2, через общий контекст]', chatIds: [FIRST_CHAT, SECOND_CHAT] })).toBe(`Задержка ${buildChatMarker(SECOND_CHAT)}`);
  });

  it('drops a number that is not in the list instead of linking someone else\'s chat', () => {
    expect(resolveChatNumbers({ text: 'Не ответила [#7]', chatIds: [FIRST_CHAT] })).toBe('Не ответила');
  });
});

describe('numberChatMarkers', () => {
  it('numbers each chat once and resolves back to the same markers', () => {
    const issues = [`Первое ${buildChatMarker(FIRST_CHAT)}`, `Второе ${buildChatMarker(SECOND_CHAT)} ${buildChatMarker(FIRST_CHAT)}`];
    const { texts, chatIds } = numberChatMarkers(issues);
    expect(texts).toEqual(['Первое [#1]', 'Второе [#2] [#1]']);
    expect(chatIds).toEqual([FIRST_CHAT, SECOND_CHAT]);
  });
});

describe('renderTelegramLinks', () => {
  it('writes the chat as an HTML link to the Sitniks dialog', () => {
    expect(renderTelegramLinks(`Ошибка ${buildChatMarker(FIRST_CHAT)}`)).toBe(
      `Ошибка <a href="https://web.sitniks.com/3911/chats/dialog/${FIRST_CHAT}">(чат)</a>`,
    );
  });
});

describe('splitSheetLinks', () => {
  it('replaces markers with the label and reports where each link sits', () => {
    const { text, links } = splitSheetLinks(`13:46 ответ ${buildChatMarker(FIRST_CHAT)} и ${buildChatMarker(SECOND_CHAT)}.`);
    expect(text).toBe('13:46 ответ (чат) и (чат).');
    expect(links).toEqual([
      { start: 12, length: 5, url: `https://web.sitniks.com/3911/chats/dialog/${FIRST_CHAT}` },
      { start: 20, length: 5, url: `https://web.sitniks.com/3911/chats/dialog/${SECOND_CHAT}` },
    ]);
    expect(text.slice(12, 17)).toBe('(чат)');
  });

  it('leaves a text without markers untouched', () => {
    expect(splitSheetLinks('Конкретных замечаний нет.')).toEqual({ text: 'Конкретных замечаний нет.', links: [] });
  });
});
