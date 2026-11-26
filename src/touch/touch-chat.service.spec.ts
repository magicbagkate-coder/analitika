import { TouchChatService } from './touch-chat.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const CHAT: ChatListItem = { id: 'c1', status: 'Вибір товару', tags: [], lastMessageCreatedAt: '', userName: 'Іра' };
const PLAN = { article: 'M1103', videoFileId: 'F1', videoFileName: 'M1103.mp4', messageText: 'm' };

function managerMessage(params: { viewed: boolean; minutesAgo: number }): ChatMessage {
  return { id: 'm1', sentBy: 'acc', managerName: 'Оля', text: 'x', createdAt: new Date(Date.now() - params.minutesAgo * 60_000).toISOString(), isViewedByUser: params.viewed };
}

type Setup = { messages: ChatMessage[]; mode?: 'live' | 'dry-run'; attempt?: object | null; madeTouch?: object | null; made?: number; plan?: object };

function build(setup: Setup) {
  const attemptRow = { id: 'a1', chatId: 'c1', anchorMessageId: 'm1', clientName: 'Іра', sourceStatus: 'Вибір товару', state: 'watching', missingAlertedAt: null, ...PLAN, ...(setup.attempt ?? {}) };
  const log = {
    findLatestMadeTouch: jest.fn().mockResolvedValue(setup.madeTouch ?? null),
    findOpenForChat: jest.fn().mockResolvedValue([]),
    findForAnchor: jest.fn().mockResolvedValue(setup.attempt === null ? null : attemptRow),
    createWatching: jest.fn().mockResolvedValue(attemptRow),
    markReadSeen: jest.fn().mockResolvedValue(undefined),
    markMissingAlerted: jest.fn().mockResolvedValue(undefined),
    savePlan: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn().mockResolvedValue(attemptRow),
    countMadeTouches: jest.fn().mockResolvedValue(setup.made ?? 0),
    claimState: jest.fn().mockResolvedValue(true),
    setState: jest.fn().mockResolvedValue(undefined),
  };
  const planner = { planTouch: jest.fn().mockResolvedValue(setup.plan ?? { status: 'ready', article: 'M1103', plan: PLAN }) };
  const approval = { requestApproval: jest.fn().mockResolvedValue(undefined) };
  const sender = { sendTouch: jest.fn().mockResolvedValue(undefined) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const config = { getTouchMode: () => setup.mode ?? 'live', getTouchWaitMinutes: () => 60 };
  const messages = { listMessages: jest.fn().mockResolvedValue({ data: setup.messages }) };
  const service = new TouchChatService(config as never, messages as never, log as never, planner as never, approval as never, sender as never, telegram as never);
  return { service, log, planner, approval, sender, telegram };
}

const READ_LONG_AGO = { readSeenAt: new Date(Date.now() - 2 * 60 * 60_000) };

describe('TouchChatService', () => {
  it('starts the hour when the client is first seen to have read the message', async () => {
    const { service, log, planner } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 5 })], attempt: null });
    await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(log.createWatching).toHaveBeenCalledWith(expect.objectContaining({ chatId: 'c1', anchorMessageId: 'm1', readSeenAt: expect.any(Date) }));
    expect(planner.planTouch).not.toHaveBeenCalled();
  });

  it('asks the owner before the first touches are sent', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO });
    const result = await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
    expect(sender.sendTouch).not.toHaveBeenCalled();
    expect(result.touched).toBe(true);
  });

  it('sends by itself once thirty touches were approved in the real status', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, made: 30 });
    await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(sender.sendTouch).toHaveBeenCalledTimes(1);
    expect(approval.requestApproval).not.toHaveBeenCalled();
  });

  it('sends a touch of the test status by itself, without asking, and tells the owner afterwards', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: { ...READ_LONG_AGO, sourceStatus: 'ТЕСТ КАТЯ' } });
    await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(approval.requestApproval).not.toHaveBeenCalled();
    expect(sender.sendTouch).toHaveBeenCalledWith(expect.objectContaining({ announce: true }));
  });

  it('in a dry run only tells the owner and sends nothing', async () => {
    const { service, approval, sender, telegram } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, mode: 'dry-run' });
    await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(telegram.sendOwnerMessage).toHaveBeenCalledTimes(1);
    expect(approval.requestApproval).not.toHaveBeenCalled();
    expect(sender.sendTouch).not.toHaveBeenCalled();
  });

  it('never touches a chat whose earlier touch is still unanswered', async () => {
    const madeTouch = { touchedAt: new Date(Date.now() - 30 * 60_000) };
    const { service, planner, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, madeTouch });
    const result = await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(planner.planTouch).not.toHaveBeenCalled();
    expect(approval.requestApproval).not.toHaveBeenCalled();
    expect(sender.sendTouch).not.toHaveBeenCalled();
    expect(result.hasUnansweredTouch).toBe(true);
  });

  it('names a chat with no article once and does not touch it', async () => {
    const { service, log, approval } = build({
      messages: [managerMessage({ viewed: true, minutesAgo: 120 })],
      attempt: READ_LONG_AGO,
      plan: { status: 'no-article', article: null, plan: null },
    });
    const result = await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(result).toMatchObject({ touched: false, noArticle: true });
    expect(log.markMissingAlerted).toHaveBeenCalledTimes(1);
    expect(approval.requestApproval).not.toHaveBeenCalled();
  });

  it('does not name the same chat twice', async () => {
    const { service } = build({
      messages: [managerMessage({ viewed: true, minutesAgo: 120 })],
      attempt: { ...READ_LONG_AGO, missingAlertedAt: new Date() },
      plan: { status: 'no-video', article: 'X9999', plan: null },
    });
    expect(await service.processChat({ chat: CHAT, pass: 'regular' })).toMatchObject({ noArticle: false, noVideo: null });
  });

  it('in the morning pass touches at once, without waiting for the hour', async () => {
    const { service, approval } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 30 })], attempt: null });
    await service.processChat({ chat: CHAT, pass: 'morning' });
    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
  });

  it('ignores a chat where the client has not read the message', async () => {
    const { service, log } = build({ messages: [managerMessage({ viewed: false, minutesAgo: 120 })], attempt: READ_LONG_AGO });
    await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(log.createWatching).not.toHaveBeenCalled();
    expect(log.savePlan).not.toHaveBeenCalled();
  });
});
