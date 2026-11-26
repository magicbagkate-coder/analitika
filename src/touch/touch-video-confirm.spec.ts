import { hasAccountVideoSince } from './touch-video-confirm';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const SINCE = new Date('2026-11-25T14:42:00.000Z');
const FILE_ID = 'FILE1';
const OUR_URL = `https://drive.usercontent.google.com/download?id=${FILE_ID}&export=download&name=${FILE_ID}.mp4`;
const ECHO_URL = 'https://video.xx.fbcdn.net/o1/v/t2/f2/m483/AQNFQzxz';

function message(params: { at: string; type?: string; manager?: string; sentBy: string; url?: string }): ChatMessage {
  return { id: params.at, sentBy: params.sentBy, managerName: params.manager, text: '', createdAt: params.at, isViewedByUser: false, messageType: params.type, attachmentUrl: params.url };
}

const MANAGER = message({ at: '2026-11-25T13:39:33.000Z', manager: 'Оля', sentBy: 'acc' });
const check = (messages: ChatMessage[]): boolean => hasAccountVideoSince({ messagesNewestFirst: messages, since: SINCE, fileId: FILE_ID });

describe('hasAccountVideoSince', () => {
  it('sees the shop\'s own record of this video, which appeared after the send began', () => {
    expect(check([message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'acc', url: OUR_URL }), MANAGER])).toBe(true);
  });

  it('does not take the copy that Facebook or Instagram echoes back for the video having arrived', () => {
    expect(check([message({ at: '2026-11-25T14:43:02.000Z', type: 'video', sentBy: 'acc', url: ECHO_URL }), MANAGER])).toBe(false);
  });

  it('does not take another video, even one the shop sent a moment ago', () => {
    const other = `https://drive.usercontent.google.com/download?id=OTHER&export=download&name=OTHER.mp4`;
    expect(check([message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'acc', url: other }), MANAGER])).toBe(false);
  });

  it('does not count a video that was already there before', () => {
    expect(check([message({ at: '2026-11-20T10:28:05.000Z', type: 'video', sentBy: 'acc', url: OUR_URL }), MANAGER])).toBe(false);
  });

  it('does not count a video the client sent', () => {
    expect(check([message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'client-9', url: OUR_URL }), MANAGER])).toBe(false);
  });

  it('does not count a text sent after the send began', () => {
    expect(check([message({ at: '2026-11-25T14:43:07.000Z', type: 'text', sentBy: 'acc' }), MANAGER])).toBe(false);
  });

  it('still sees the record in a chat where only the automatic bot has written', () => {
    expect(check([message({ at: '2026-11-25T14:43:07.000Z', type: 'video', sentBy: 'acc', url: OUR_URL })])).toBe(true);
  });
});
