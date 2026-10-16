import { describeClientWaits } from './client-wait-facts';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const base = { sentBy: 'client-1', text: 'x', isViewedByUser: true };

function message(overrides: Partial<ChatMessage> & { id: string; createdAt: string }): ChatMessage {
  return { ...base, ...overrides };
}

describe('describeClientWaits', () => {
  it('lists a client message and the manager reply with the computed wait', () => {
    const newestFirst = [
      message({ id: '2', createdAt: '2026-10-14T09:10:00.000Z', managerName: 'Дарія Братко', sentBy: 'account' }),
      message({ id: '1', createdAt: '2026-10-14T09:00:00.000Z' }),
    ];

    const facts = describeClientWaits(newestFirst);

    expect(facts).toContain('Дарія Братко');
    expect(facts).toContain('(10 мин)');
  });

  it('ignores a wait that started with a tap on the bot price button', () => {
    const newestFirst = [
      message({ id: '2', createdAt: '2026-10-14T15:00:00.000Z', managerName: 'Дарія Братко', sentBy: 'account' }),
      message({ id: '1', createdAt: '2026-10-14T09:00:00.000Z', text: 'дізнатись ціну' }),
    ];

    expect(describeClientWaits(newestFirst)).toContain('ответов менеджеров');
  });

  it('says so when no manager replied', () => {
    const facts = describeClientWaits([message({ id: '1', createdAt: '2026-10-14T09:00:00.000Z' })]);

    expect(facts).toContain('ответов менеджеров');
  });
});
