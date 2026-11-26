import { TouchApprovalService } from './touch-approval.service';

type Handlers = { onButton: (press: { data: string; messageId: number }) => Promise<string>; onText: (text: string) => Promise<string | null> };

function build(params: { claimWins?: boolean; pending?: Array<{ id: string }> }) {
  let handlers: Handlers | undefined;
  const bot = { startPolling: jest.fn((given: Handlers) => (handlers = given)), sendWithButtons: jest.fn().mockResolvedValue(77) };
  const log = {
    claimState: jest.fn().mockResolvedValue(params.claimWins ?? true),
    findById: jest.fn().mockResolvedValue({ id: 'a1', chatId: 'c1' }),
    findPendingApprovals: jest.fn().mockResolvedValue(params.pending ?? []),
    markPendingApproval: jest.fn().mockResolvedValue(undefined),
  };
  const sender = { sendTouch: jest.fn().mockResolvedValue(undefined) };
  const service = new TouchApprovalService(bot as never, log as never, sender as never);
  service.startListening({ onForce: async (attemptId) => `forced ${attemptId}` });
  return { service, bot, log, sender, press: (data: string) => handlers!.onButton({ data, messageId: 1 }), type: (text: string) => handlers!.onText(text) };
}

describe('TouchApprovalService', () => {
  it('shows the owner the touch with two buttons and remembers the message', async () => {
    const { service, bot, log } = build({});
    await service.requestApproval({ id: 'a1', chatId: 'c1', clientName: 'Іра', sourceStatus: 'Вибір товару' } as never);

    expect(bot.sendWithButtons.mock.calls[0][0].rows[0].map((button: { data: string }) => button.data)).toEqual(['approve:a1', 'skip:a1']);
    expect(log.markPendingApproval).toHaveBeenCalledWith({ id: 'a1', approvalMessageId: 77 });
  });

  it('sends the touch once when the owner approves', async () => {
    const { press, sender } = build({});
    expect(await press('approve:a1')).toBe('Отправляю…');
    expect(sender.sendTouch).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a second tap: the touch is already claimed', async () => {
    const { press, sender } = build({ claimWins: false });
    expect(await press('approve:a1')).toBe('Уже обработано');
    expect(sender.sendTouch).not.toHaveBeenCalled();
  });

  it('skips without sending', async () => {
    const { press, sender, log } = build({});
    expect(await press('skip:a1')).toBe('Пропущено');
    expect(log.claimState).toHaveBeenCalledWith({ id: 'a1', from: ['pending_approval'], to: 'skipped' });
    expect(sender.sendTouch).not.toHaveBeenCalled();
  });

  it('approves a typed "ок" only when exactly one touch is waiting', async () => {
    const one = build({ pending: [{ id: 'a1' }] });
    expect(await one.type('Ок')).toBe('Отправляю…');

    const two = build({ pending: [{ id: 'a1' }, { id: 'a2' }] });
    expect(await two.type('ок')).toContain('2 касаний');
    expect(two.sender.sendTouch).not.toHaveBeenCalled();
  });

  it('hands a "touch anyway" button to the force handler', async () => {
    const { press } = build({});
    expect(await press('force:a9')).toBe('forced a9');
  });

  it('stays silent for any other text', async () => {
    const { type } = build({ pending: [{ id: 'a1' }] });
    expect(await type('привет')).toBeNull();
  });
});
