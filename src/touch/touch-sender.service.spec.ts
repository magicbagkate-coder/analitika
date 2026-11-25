import { TouchSenderService } from './touch-sender.service';
import type { TouchAttemptEntity } from '../touch-log/touch-attempt.entity';

const ATTEMPT = {
  id: 'a1',
  chatId: 'c1',
  clientName: 'Іра',
  videoFileId: 'FILE1',
  videoFileName: 'M1103.mp4',
  descriptionText: 'Модель M1103',
  questionText: 'Чи хотіли б Ви обрати цю модель?',
} as TouchAttemptEntity;

type Outcome = 'sent' | 'rejected' | 'uncertain';

const MANAGER_MESSAGE = { id: 'm', sentBy: 'acc', managerName: 'Оля', text: 'x', createdAt: '2026-01-01T00:00:00.000Z', isViewedByUser: true };

function freshVideo(): object {
  return { id: 'v', sentBy: 'acc', text: '', createdAt: new Date(Date.now() + 1000).toISOString(), isViewedByUser: false, messageType: 'video' };
}

function build(results: Outcome[], chatMessages: object[] = []): { service: TouchSenderService; send: jest.Mock; log: { finishSend: jest.Mock }; telegram: { sendOwnerMessage: jest.Mock }; listMessages: jest.Mock } {
  const send = jest.fn();
  results.forEach((outcome) => send.mockResolvedValueOnce({ outcome, detail: outcome === 'sent' ? 'accepted' : '500' }));
  const log = { finishSend: jest.fn().mockResolvedValue(undefined) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const listMessages = jest.fn().mockResolvedValue({ data: chatMessages });
  const service = new TouchSenderService({ sendMessage: send } as never, { listMessages } as never, log as never, telegram as never);
  service.settleMs = 0;
  service.confirmMs = 30;
  service.confirmIntervalMs = 10;
  return { service, send, log, telegram, listMessages };
}

describe('TouchSenderService', () => {
  it('sends the video, then the description, then the question, and marks the touch sent', async () => {
    const { service, send, log } = build(['sent', 'sent', 'sent']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(send.mock.calls.map(([call]) => Object.keys(call).filter((key) => key !== 'chatId'))).toEqual([['attachments'], ['text'], ['text']]);
    expect(send.mock.calls[0][0].attachments[0]).toContain('FILE1');
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'sent' });
  });

  it('goes on with the texts when a 504 video turns up in the chat (the big-file case)', async () => {
    const { service, send, log } = build(['uncertain', 'sent', 'sent'], [freshVideo(), MANAGER_MESSAGE]);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(send).toHaveBeenCalledTimes(3);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'sent' });
  });

  it('never sends the video again while it waits for the chat', async () => {
    const { service, send } = build(['uncertain', 'sent', 'sent'], [freshVideo(), MANAGER_MESSAGE]);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(send.mock.calls.filter(([call]) => call.attachments).length).toBe(1);
  });

  it('does not wait for the chat after a refusal', async () => {
    const { service, listMessages } = build(['rejected']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(listMessages).not.toHaveBeenCalled();
  });

  it('never sends the texts when the video was not accepted', async () => {
    const { service, send, log, telegram } = build(['uncertain'], [MANAGER_MESSAGE]);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(send).toHaveBeenCalledTimes(1);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'uncertain' });
    expect(telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
  });

  it('marks a refused video as rejected: nothing reached the client', async () => {
    const { service, log } = build(['rejected']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'rejected' });
  });

  it('marks the touch uncertain, not sent, when the question fails after the video went out', async () => {
    const { service, send, log } = build(['sent', 'sent', 'uncertain']);
    await service.sendTouch({ attempt: ATTEMPT, announce: false });

    expect(send).toHaveBeenCalledTimes(3);
    expect(log.finishSend).toHaveBeenCalledWith({ id: 'a1', state: 'uncertain' });
  });

  it('tells the owner about a sent touch only while she still watches them', async () => {
    const quiet = build(['sent', 'sent', 'sent']);
    await quiet.service.sendTouch({ attempt: ATTEMPT, announce: false });
    expect(quiet.telegram.sendOwnerMessage).not.toHaveBeenCalled();

    const watched = build(['sent', 'sent', 'sent']);
    await watched.service.sendTouch({ attempt: ATTEMPT, announce: true });
    expect(watched.telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
  });

  it('refuses to send a touch that has no plan', async () => {
    const { service, send } = build([]);
    await expect(service.sendTouch({ attempt: { ...ATTEMPT, videoFileId: null } as TouchAttemptEntity, announce: false })).rejects.toThrow('no plan');
    expect(send).not.toHaveBeenCalled();
  });
});
