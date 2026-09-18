import { Test } from '@nestjs/testing';
import { ClaudeTrendsService } from '../claude/claude-trends.service';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { TelegramService } from '../telegram/telegram.service';
import { ManagerTrendsService } from './manager-trends.service';
import type { EvaluationHistoryEntity } from '../evaluation-history/evaluation-history.entity';

function historyRow(overrides: Partial<EvaluationHistoryEntity>): EvaluationHistoryEntity {
  return {
    id: 'x',
    chatId: 'c',
    clientName: 'client',
    managerNames: ['Аня'],
    score: 4,
    source: 'product_selection',
    note: 'note',
    medianResponseMinutes: null,
    recordedAt: new Date(),
    ...overrides,
  };
}

describe('ManagerTrendsService', () => {
  let service: ManagerTrendsService;
  let historyService: { findSince: jest.Mock };
  let claudeTrendsService: { synthesizeRecurringIssues: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(async () => {
    historyService = { findSince: jest.fn().mockResolvedValue([]) };
    claudeTrendsService = { synthesizeRecurringIssues: jest.fn().mockResolvedValue('') };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ManagerTrendsService,
        { provide: EvaluationHistoryService, useValue: historyService },
        { provide: ClaudeTrendsService, useValue: claudeTrendsService },
        { provide: TelegramService, useValue: telegramService },
      ],
    }).compile();
    service = module.get(ManagerTrendsService);
  });

  const now = new Date('2026-09-18T10:00:00.000Z');
  function daysAgo(days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  it('sends nothing when there is no data at all', async () => {
    jest.useFakeTimers().setSystemTime(now);
    await service.runDigest();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('excludes order_created rows from the trend — only product_selection counts', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([
      historyRow({ score: 5, source: 'order_created', recordedAt: daysAgo(1) }),
      historyRow({ score: 5, source: 'order_created', recordedAt: daysAgo(8) }),
      historyRow({ score: 5, source: 'order_created', recordedAt: daysAgo(15) }),
    ]);

    await service.runDigest();

    // Nothing product_selection at all -> no trend possible, nothing sent.
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('detects a rising trend across 3 consecutive weeks and sends the digest', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([
      historyRow({ score: 3, recordedAt: daysAgo(15) }), // week 2
      historyRow({ score: 4, recordedAt: daysAgo(8) }), // week 1
      historyRow({ score: 5, recordedAt: daysAgo(1) }), // week 0
    ]);

    await service.runDigest();

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    const [message] = telegramService.sendMessage.mock.calls[0];
    expect(message).toContain('Аня: оценка растёт 3 недели подряд');
    jest.useRealTimers();
  });

  it('does not report a trend with fewer than 3 consecutive weeks of data', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([
      historyRow({ score: 4, recordedAt: daysAgo(8) }),
      historyRow({ score: 5, recordedAt: daysAgo(1) }),
    ]);

    await service.runDigest();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not report a trend that goes up then down (not monotonic)', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([
      historyRow({ score: 3, recordedAt: daysAgo(15) }),
      historyRow({ score: 5, recordedAt: daysAgo(8) }),
      historyRow({ score: 3, recordedAt: daysAgo(1) }),
    ]);

    await service.runDigest();

    expect(telegramService.sendMessage).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('still sends recurring-issue text even with no score trend', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([historyRow({ recordedAt: daysAgo(1) })]);
    claudeTrendsService.synthesizeRecurringIssues.mockResolvedValue('Аня: не знає асортимент, 3 тижні поспіль');

    await service.runDigest();

    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('does not let a Claude synthesis failure stop the digest — falls back to trends only', async () => {
    jest.useFakeTimers().setSystemTime(now);
    historyService.findSince.mockResolvedValue([
      historyRow({ score: 3, recordedAt: daysAgo(15) }),
      historyRow({ score: 4, recordedAt: daysAgo(8) }),
      historyRow({ score: 5, recordedAt: daysAgo(1) }),
    ]);
    claudeTrendsService.synthesizeRecurringIssues.mockRejectedValue(new Error('Claude timeout'));

    await expect(service.runDigest()).resolves.toBeUndefined();
    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
