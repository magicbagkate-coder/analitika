import { TouchChatService } from './touch-chat.service';
import type { ChatListItem } from '../sitniks-chat-list/sitniks-chat-list.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const CHAT: ChatListItem = { id: 'c1', status: 'Вибір товару', tags: [], lastMessageCreatedAt: '', userName: 'Іра' };
const PLAN = { article: 'M1103', videos: [{ fileId: 'F1', fileName: 'M1103.mp4', article: 'M1103' }], messageText: 'm' };

function managerMessage(params: { viewed: boolean; minutesAgo: number }): ChatMessage {
  return { id: 'm1', sentBy: 'acc', managerName: 'Оля', text: 'x', createdAt: new Date(Date.now() - params.minutesAgo * 60_000).toISOString(), isViewedByUser: params.viewed };
}

type Setup = { messages: ChatMessage[]; mode?: 'live' | 'dry-run'; attempt?: object | null; madeTouch?: object | null; approvalOff?: boolean; plan?: object };

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
    claimState: jest.fn().mockResolvedValue(true),
    setState: jest.fn().mockResolvedValue(undefined),
    markSkippedByMeaning: jest.fn().mockResolvedValue(undefined),
  };
  const planner = { planTouch: jest.fn().mockResolvedValue(setup.plan ?? { status: 'ready', missing: [], plan: PLAN }) };
  const approval = { requestApproval: jest.fn().mockResolvedValue(undefined) };
  const sender = { sendTouch: jest.fn().mockResolvedValue(undefined) };
  const telegram = { sendOwnerMessage: jest.fn().mockResolvedValue(undefined) };
  const config = { getTouchMode: () => setup.mode ?? 'live', getTouchWaitMinutes: () => 60, getTouchApprovalRequired: () => setup.approvalOff !== true };
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

  it('asks the owner before a touch is sent', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO });
    const result = await service.processChat({ chat: CHAT, pass: 'regular' });
    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
    expect(sender.sendTouch).not.toHaveBeenCalled();
    expect(result.touched).toBe(true);
  });

  it('sends by itself once the owner has switched the approval off', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, approvalOff: true });
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

  it('asks the owner for a touch in the new-bot status as well', async () => {
    const { service, approval, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: { ...READ_LONG_AGO, sourceStatus: 'Новий БОТ' } });
    await service.processChat({ chat: { ...CHAT, status: 'Новий БОТ' }, pass: 'regular' });

    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
    expect(sender.sendTouch).not.toHaveBeenCalled();
  });

  it('in the test status touches again even though the client did not answer the last touch', async () => {
    const madeTouch = { touchedAt: new Date(Date.now() - 30 * 60_000) };
    const { service, sender } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: { ...READ_LONG_AGO, sourceStatus: 'ТЕСТ КАТЯ' }, madeTouch });
    const result = await service.processChat({ chat: { ...CHAT, status: 'ТЕСТ КАТЯ' }, pass: 'regular' });

    expect(sender.sendTouch).toHaveBeenCalledTimes(1);
    expect(result.hasUnansweredTouch).toBe(true);
  });

  it('names a chat with no article once and does not touch it', async () => {
    const { service, log, approval } = build({
      messages: [managerMessage({ viewed: true, minutesAgo: 120 })],
      attempt: READ_LONG_AGO,
      plan: { status: 'no-article', missing: [], plan: null },
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
      plan: { status: 'no-video', missing: ['X9999'], plan: null },
    });
    expect(await service.processChat({ chat: CHAT, pass: 'regular' })).toMatchObject({ noArticle: false, noVideo: [], skipped: null });
  });

  it('sends the videos that exist and names the articles that have none, once', async () => {
    const { service, approval, log } = build({
      messages: [managerMessage({ viewed: true, minutesAgo: 120 })],
      attempt: READ_LONG_AGO,
      plan: { status: 'ready', missing: ['X9999'], plan: PLAN },
    });
    const result = await service.processChat({ chat: CHAT, pass: 'regular' });

    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ touched: true, noVideo: [{ article: 'X9999' }] });
    expect(log.markMissingAlerted).toHaveBeenCalledTimes(1);
  });

  it('leaves a chat alone when the dialog says no touch, keeps the reason, and shows it to the owner in the test status', async () => {
    const { service, log, approval, sender } = build({
      messages: [managerMessage({ viewed: true, minutesAgo: 120 })],
      attempt: { ...READ_LONG_AGO, sourceStatus: 'ТЕСТ КАТЯ' },
      plan: { status: 'skip', skipReason: 'Клиентка написала «не потрібно»', missing: [], plan: null },
    });
    const result = await service.processChat({ chat: { ...CHAT, status: 'ТЕСТ КАТЯ' }, pass: 'regular' });

    expect(log.markSkippedByMeaning).toHaveBeenCalledWith({ id: 'a1', reason: 'Клиентка написала «не потрібно»' });
    expect(result).toMatchObject({ touched: false, skipped: { reason: 'Клиентка написала «не потрібно»' } });
    expect(approval.requestApproval).not.toHaveBeenCalled();
    expect(sender.sendTouch).not.toHaveBeenCalled();
  });

  it('stops listing skipped chats to the owner once the approval is switched off', async () => {
    const watched = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, plan: { status: 'skip', skipReason: 'r', missing: [], plan: null } });
    expect((await watched.service.processChat({ chat: CHAT, pass: 'regular' })).skipped).not.toBeNull();

    const settled = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: READ_LONG_AGO, approvalOff: true, plan: { status: 'skip', skipReason: 'r', missing: [], plan: null } });
    const result = await settled.service.processChat({ chat: CHAT, pass: 'regular' });
    expect(result.skipped).toBeNull();
    expect(settled.log.markSkippedByMeaning).toHaveBeenCalledTimes(1);
  });

  it('touches a chat the dialog had ruled out when the owner chooses to touch anyway', async () => {
    const { service, log, planner, approval } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: { state: 'skipped' } });
    await service.processChat({ chat: CHAT, pass: 'morning', force: true });

    expect(log.claimState).toHaveBeenCalledWith({ id: 'a1', from: ['skipped'], to: 'watching' });
    expect(planner.planTouch).toHaveBeenCalledWith(expect.objectContaining({ forceTouch: true }));
    expect(approval.requestApproval).toHaveBeenCalledTimes(1);
  });

  it('leaves a skipped chat alone when the owner has not chosen to touch anyway', async () => {
    const { service, planner } = build({ messages: [managerMessage({ viewed: true, minutesAgo: 120 })], attempt: { state: 'skipped' } });
    await service.processChat({ chat: CHAT, pass: 'morning' });
    expect(planner.planTouch).not.toHaveBeenCalled();
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
