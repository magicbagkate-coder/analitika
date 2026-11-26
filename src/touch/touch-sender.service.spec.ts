import { TouchSenderService } from './touch-sender.service';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

const ATTEMPT = {
  id: 'a1',
  chatId: 'c1',
  clientName: 'Іра',
  videos: [{ fileId: 'FILE1', fileName: 'M1103.mp4', article: 'M1103' }],
  messageText: 'Знайшла для Вас чудовий відеоогляд цієї сумочки. Чи хотіли б Ви обрати її для себе?',
} as unknown as TouchAttemptEntity;

type Outcome = 'sent' | 'rejected' | 'uncertain';

const MANAGER_MESSAGE = { id: 'm', sentBy: 'acc', managerName: 'Оля', text: 'x', createdAt: '2026-01-01T00:00:00.000Z', isViewedByUser: true };

/** The shop's own record of a video, as Sitniks writes it once it has fetched the file. */
function freshVideo(fileId: string): object {
  const attachmentUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&name=${fileId}.mp4`;
  return { id: `v-${fileId}`, sentBy: 'acc', text: '', createdAt: new Date(Date.now() + 60_000).toISOString(), isViewedByUser: false, messageType: 'video', attachmentUrl };
}

/** `results` are Sitniks' answers to the sends in order: each video, then the message. */
function build(results: Outcome[], chatMessages: object[] = [freshVideo('FILE1'), freshVideo('A1'), freshVideo('B2'), MANAGER_MESSAGE]) {
  const send = jest.fn();
  results.forEach((outcome) => send.mockResolvedValueOnce({ outcome, detail: outcome === 'sent' ? 'accepted' : '504' }));
  const log = { finishSend: jest.fn().mockResolvedValue(undefined) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const listMessages = jest.fn().mockResolvedValue({ data: chatMessages });
  const store = { buildSendUrl: jest.fn(async (fileId: string) => `https://server.example/touch-videos/${fileId}.mp4`) };
  const service = new TouchSenderService({ sendMessage: send } as never, { listMessages } as never, log as never, telegram as never, store as never);
  service.messageGapMs = 0;
  service.confirmMs = 30;
  service.confirmIntervalMs = 10;
  return { service, send, log, telegram, listMessages };
}

function sentKinds(send: jest.Mock): string[] {
  return send.mock.calls.map(([call]) => (call.attachments ? 'video' : 'text'));
}

describe('TouchSenderService', () => {
  it('sends the video, then one message with the line and the question, and marks the touch sent', async () => {
    const { service, send, log } = build(['sent', 'sent']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(sentKinds(send)).toEqual(['video', 'text']);
    expect(send.mock.calls[0][0].attachments[0]).toContain('FILE1');
    expect(send.mock.calls[1][0].text).toBe(ATTEMPT.messageText);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'sent' });
  });

  it('sends several videos one after another, then one message about the variants', async () => {
    const attempt = { ...ATTEMPT, videos: [{ fileId: 'A1', fileName: '990318.mp4', article: '990318' }, { fileId: 'B2', fileName: '990320.mp4', article: '990320' }] } as unknown as TouchAttemptEntity;
    const { service, send, log } = build(['sent', 'sent', 'sent']);
    await service.sendTouch({ attempt, announce: false });

    expect(sentKinds(send)).toEqual(['video', 'video', 'text']);
    expect(send.mock.calls[0][0].attachments[0]).toContain('A1');
    expect(send.mock.calls[1][0].attachments[0]).toContain('B2');
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'sent' });
  });

  it('stops after the first video when the second is refused: the client already has one, so it is uncertain', async () => {
    const attempt = { ...ATTEMPT, videos: [{ fileId: 'A1', fileName: 'a.mp4', article: 'a1' }, { fileId: 'B2', fileName: 'b.mp4', article: 'b2' }] } as unknown as TouchAttemptEntity;
    const { service, send, log } = build(['sent', 'rejected']);
    await service.sendTouch({ attempt, announce: false });

    expect(sentKinds(send)).toEqual(['video', 'video']);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'uncertain' });
  });

  it('sends the message once a 504 video has turned up in the chat (the big-file case)', async () => {
    const { service, send, log } = build(['uncertain', 'sent']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(sentKinds(send)).toEqual(['video', 'text']);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'sent' });
  });

  it('never sends the video twice while it waits for it', async () => {
    const { service, send } = build(['uncertain', 'sent']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(sentKinds(send).filter((kind) => kind === 'video')).toHaveLength(1);
  });

  it('never sends the message when the video does not show up, and tells the owner', async () => {
    const { service, send, log, telegram } = build(['uncertain'], [MANAGER_MESSAGE]);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(sentKinds(send)).toEqual(['video']);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'uncertain' });
    expect(telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
  });

  it('stops at once when the video is refused: nothing reached the client', async () => {
    const { service, send, log, listMessages } = build(['rejected']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(sentKinds(send)).toEqual(['video']);
    expect(listMessages).not.toHaveBeenCalled();
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'rejected' });
  });

  it('marks the touch uncertain when the message fails after the video arrived', async () => {
    const { service, log } = build(['sent', 'uncertain']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'uncertain' });
  });

  it('tells the owner about a sent touch only while she still watches them', async () => {
    const quiet = build(['sent', 'sent']);
    await quiet.service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(quiet.telegram.sendOwnerMessage).not.toHaveBeenCalled();

    const watched = build(['sent', 'sent']);
    await watched.service.sendTouch({ attempt: ATTEMPT, announce: true });
    expect(watched.telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses to send a touch that has no plan', async () => {
    const { service, send } = build([]);
    await expect(service.sendTouch({ attempt: { ...ATTEMPT, videos: [] } as unknown as TouchAttemptEntity, announce: false })).rejects.toThrow('no plan');
    expect(send).not.toHaveBeenCalled();
  });
});
