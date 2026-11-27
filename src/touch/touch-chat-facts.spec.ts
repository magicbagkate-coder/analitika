import { readChatTouchFacts } from './touch-chat-facts';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const ACCOUNT = 'account-1';

function message(params: { id: string; at: string; manager?: string; sentBy?: string; viewed?: boolean }): ChatMessage {
  return {
    id: params.id,
    sentBy: params.sentBy ?? (params.manager ? ACCOUNT : 'client-9'),
    managerName: params.manager,
    text: 'x',
    createdAt: params.at,
    isViewedByUser: params.viewed ?? false,
  };
}

describe('readChatTouchFacts', () => {
  it('knows the shop\'s automatic reply by the client id even when no manager wrote in the chat', () => {
    const messages = [
      message({ id: 'b2', at: '2026-11-27T10:00:00.000Z', sentBy: 'shop-1', viewed: true }),
      message({ id: 'c1', at: '2026-11-27T09:59:00.000Z', sentBy: 'client-9' }),
    ];
    expect(readChatTouchFacts(messages, { clientId: 'client-9' })).toMatchObject({ lastParty: 'client', anchorMessageId: null });
    expect(readChatTouchFacts(messages, { clientId: 'client-9' }).lastClientAt?.toISOString()).toBe('2026-11-27T09:59:00.000Z');
  });

  it('follows the shop\'s automatic reply in the new-bot status, once the client has read it', () => {
    const messages = [
      message({ id: 'b2', at: '2026-11-27T10:00:00.000Z', sentBy: 'shop-1', viewed: true }),
      message({ id: 'c1', at: '2026-11-27T09:59:00.000Z', sentBy: 'client-9' }),
    ];
    expect(readChatTouchFacts(messages, { clientId: 'client-9', botSpeaksForShop: true })).toMatchObject({ lastParty: 'manager', anchorMessageId: 'b2', anchorIsRead: true });
  });

  it('does not follow an automatic reply the client has not read yet', () => {
    const messages = [message({ id: 'b2', at: '2026-11-27T10:00:00.000Z', sentBy: 'shop-1' })];
    expect(readChatTouchFacts(messages, { clientId: 'client-9', botSpeaksForShop: true })).toMatchObject({ lastParty: 'manager', anchorIsRead: false });
  });

  it('finds a manager message as the last word and its read state', () => {
    const facts = readChatTouchFacts([
      message({ id: 'm2', at: '2026-11-25T10:00:00.000Z', manager: 'Оля', viewed: true }),
      message({ id: 'c1', at: '2026-11-25T09:00:00.000Z' }),
    ]);
    expect(facts).toMatchObject({ lastParty: 'manager', anchorMessageId: 'm2', anchorIsRead: true });
    expect(facts.lastClientAt?.toISOString()).toBe('2026-11-25T09:00:00.000Z');
  });

  it('does not count the shop\'s automatic reply as anybody speaking', () => {
    const facts = readChatTouchFacts([
      message({ id: 'b1', at: '2026-11-25T10:05:00.000Z', sentBy: ACCOUNT }),
      message({ id: 'm1', at: '2026-11-25T10:00:00.000Z', manager: 'Оля', viewed: true }),
    ]);
    expect(facts).toMatchObject({ lastParty: 'manager', anchorMessageId: 'm1' });
    expect(facts.lastMessageAt?.toISOString()).toBe('2026-11-25T10:05:00.000Z');
  });

  it('says the client spoke last when the client wrote after the manager', () => {
    const facts = readChatTouchFacts([
      message({ id: 'c2', at: '2026-11-25T11:00:00.000Z' }),
      message({ id: 'm1', at: '2026-11-25T10:00:00.000Z', manager: 'Оля' }),
    ]);
    expect(facts).toMatchObject({ lastParty: 'client', anchorMessageId: null, anchorIsRead: false });
  });

  it('reports an unread manager message as not read', () => {
    expect(readChatTouchFacts([message({ id: 'm1', at: '2026-11-25T10:00:00.000Z', manager: 'Оля', viewed: false })]).anchorIsRead).toBe(false);
  });

  it('returns none for an empty chat', () => {
    expect(readChatTouchFacts([])).toEqual({ lastParty: 'none', anchorMessageId: null, anchorIsRead: false, lastClientAt: null, lastMessageAt: null });
  });
});
