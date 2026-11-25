import { hasAccountVideoSince } from './touch-video-confirm';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const SINCE = new Date('2026-11-25T14:42:00.000Z');

function message(params: { at: string; type?: string; manager?: string; sentBy: string }): ChatMessage {
  return { id: params.at, sentBy: params.sentBy, managerName: params.manager, text: '', createdAt: params.at, isViewedByUser: false, messageType: params.type };
}

const MANAGER = message({ at: '2026-11-25T13:39:33.000Z', manager: 'Оля', sentBy: 'acc' });

describe('hasAccountVideoSince', () => {
  it('sees the shop\'s video that appeared after the send began', () => {
    const video = message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'acc' });
    expect(hasAccountVideoSince({ messagesNewestFirst: [video, MANAGER], since: SINCE })).toBe(true);
  });

  it('does not count a video that was already there before', () => {
    const old = message({ at: '2026-11-20T10:28:05.000Z', type: 'video', sentBy: 'acc' });
    expect(hasAccountVideoSince({ messagesNewestFirst: [old, MANAGER], since: SINCE })).toBe(false);
  });

  it('does not count a video the client sent', () => {
    const fromClient = message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'client-9' });
    expect(hasAccountVideoSince({ messagesNewestFirst: [fromClient, MANAGER], since: SINCE })).toBe(false);
  });

  it('does not count a text sent after the send began', () => {
    const text = message({ at: '2026-11-25T14:43:07.000Z', type: 'text', sentBy: 'acc' });
    expect(hasAccountVideoSince({ messagesNewestFirst: [text, MANAGER], since: SINCE })).toBe(false);
  });

  it('cannot tell the account apart when no manager ever wrote in the chat', () => {
    const video = message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'acc' });
    expect(hasAccountVideoSince({ messagesNewestFirst: [video], since: SINCE })).toBe(false);
  });
});
