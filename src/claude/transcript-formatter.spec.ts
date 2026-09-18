import { formatTranscript, toKyivTime } from './transcript-formatter';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

describe('formatTranscript', () => {
  it('labels a manager message with the canonical resolved name', () => {
    const messages: ChatMessage[] = [
      { id: '1', sentBy: 'acct1', managerName: 'Ольга', text: 'Вітаю', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: true },
    ];
    expect(formatTranscript(messages)).toContain('Ольга Шульц: Вітаю');
  });

  it('labels an unnamed message from the client, not the account, as the client', () => {
    const messages: ChatMessage[] = [
      { id: '2', sentBy: 'acct1', managerName: 'Аня', text: 'Вітаю', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: true },
      { id: '1', sentBy: 'client123', text: 'Привіт', createdAt: '2026-09-18T09:59:00.000Z', isViewedByUser: true },
    ];
    expect(formatTranscript(messages)).toContain('клієнтка: Привіт');
  });

  it('labels an unnamed message sharing the account\'s own sentBy as the automated bot, not the client', () => {
    const messages: ChatMessage[] = [
      { id: '2', sentBy: 'acct1', managerName: 'Аня', text: 'Вітаю', createdAt: '2026-09-18T10:01:00.000Z', isViewedByUser: true },
      { id: '1', sentBy: 'acct1', text: 'Вітаю! Гарний вибір!', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: true },
    ];
    expect(formatTranscript(messages)).toContain('АВТОМАТИЧНИЙ БОТ Instagram: Вітаю! Гарний вибір!');
  });

  it('marks an unread manager message so the evaluation prompt can see it', () => {
    const messages: ChatMessage[] = [
      { id: '1', sentBy: 'acct1', managerName: 'Аня', text: 'Ось фото', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: false },
    ];
    expect(formatTranscript(messages)).toContain('[клієнтка ЩЕ НЕ прочитала це повідомлення]');
  });

  it('does not mark a read manager message', () => {
    const messages: ChatMessage[] = [
      { id: '1', sentBy: 'acct1', managerName: 'Аня', text: 'Ось фото', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: true },
    ];
    expect(formatTranscript(messages)).not.toContain('ЩЕ НЕ прочитала');
  });

  it('never marks a client message as unread, even if isViewedByUser is false on it', () => {
    const messages: ChatMessage[] = [
      { id: '1', sentBy: 'client123', text: 'Привіт', createdAt: '2026-09-18T10:00:00.000Z', isViewedByUser: false },
    ];
    expect(formatTranscript(messages)).not.toContain('ЩЕ НЕ прочитала');
  });
});

describe('toKyivTime', () => {
  it('formats a UTC ISO string as DD.MM.YYYY, HH:mm in Kyiv time', () => {
    expect(toKyivTime('2026-09-18T12:45:00.000Z')).toBe('18.09.2026, 15:45');
  });
});
