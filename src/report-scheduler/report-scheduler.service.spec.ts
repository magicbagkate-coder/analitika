import { Test } from '@nestjs/testing';
import { EvaluationHistoryService } from '../evaluation-history/evaluation-history.service';
import { ManagerCharacteristicsService } from '../manager-characteristics/manager-characteristics.service';
import { OrderSuccessAnalysisService } from '../order-success-analysis/order-success-analysis.service';
import { ReplyTimesService } from '../reply-times/reply-times.service';
import { ReportRunStatusService } from '../report-run-status/report-run-status.service';
import { StatusReportService } from '../status-report/status-report.service';
import { TelegramService } from '../telegram/telegram.service';
import { ReportSchedulerService } from './report-scheduler.service';

describe('ReportSchedulerService.runBoth', () => {
  let service: ReportSchedulerService;
  let orderSuccessAnalysisService: { runAnalysis: jest.Mock };
  let statusReportService: { runReport: jest.Mock };
  let managerCharacteristicsService: { runSummary: jest.Mock };
  let telegramService: { sendMessage: jest.Mock };
  let reportRunStatusService: { start: jest.Mock; finish: jest.Mock };
  let evaluationHistoryService: { findSince: jest.Mock };
  let replyTimesService: { flush: jest.Mock };
  const callOrder: string[] = [];

  beforeEach(async () => {
    callOrder.length = 0;
    orderSuccessAnalysisService = {
      runAnalysis: jest.fn().mockImplementation(async () => {
        callOrder.push('order-success');
      }),
    };
    statusReportService = {
      runReport: jest.fn().mockImplementation(async () => {
        callOrder.push('status-report');
      }),
    };
    managerCharacteristicsService = {
      runSummary: jest.fn().mockImplementation(async () => {
        callOrder.push('manager-characteristics');
      }),
    };
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
    reportRunStatusService = { start: jest.fn(), finish: jest.fn() };
    evaluationHistoryService = { findSince: jest.fn().mockResolvedValue([]) };
    replyTimesService = {
      flush: jest.fn().mockImplementation(async () => {
        callOrder.push('reply-times-flush');
      }),
    };

    const module = await Test.createTestingModule({
      providers: [
        ReportSchedulerService,
        { provide: OrderSuccessAnalysisService, useValue: orderSuccessAnalysisService },
        { provide: StatusReportService, useValue: statusReportService },
        { provide: ManagerCharacteristicsService, useValue: managerCharacteristicsService },
        { provide: TelegramService, useValue: telegramService },
        { provide: ReportRunStatusService, useValue: reportRunStatusService },
        { provide: EvaluationHistoryService, useValue: evaluationHistoryService },
        { provide: ReplyTimesService, useValue: replyTimesService },
      ],
    }).compile();
    service = module.get(ReportSchedulerService);
  });

  it('runs the three steps strictly in sequence: order-success, then status-report, then manager-characteristics', async () => {
    await service.runBoth();
    expect(callOrder.slice(0, 3)).toEqual(['order-success', 'status-report', 'manager-characteristics']);
  });

  it('saves reply times only after the whole report is out, as the very last thing', async () => {
    await service.runBoth();

    expect(callOrder).toEqual(['order-success', 'status-report', 'manager-characteristics', 'reply-times-flush']);
    const sentTexts = telegramService.sendMessage.mock.calls.map(([text]) => text);
    expect(sentTexts[sentTexts.length - 1]).toContain('Отчёт полностью сформирован');
  });

  it('still saves reply times when a step failed, because those chats were already evaluated and tagged', async () => {
    statusReportService.runReport.mockRejectedValue(new Error('Claude down'));

    await expect(service.runBoth()).rejects.toThrow();

    expect(replyTimesService.flush).toHaveBeenCalledTimes(1);
  });

  it('does not wait for the save: a stalled database cannot hold up the run or leave the app "busy"', async () => {
    replyTimesService.flush.mockReturnValue(new Promise(() => undefined));

    await expect(service.runBoth()).resolves.toBeUndefined();

    expect(reportRunStatusService.finish).toHaveBeenCalledTimes(1);
  });

  it('marks the run busy at the start and not-busy at the end, even on success', async () => {
    await service.runBoth();
    expect(reportRunStatusService.start).toHaveBeenCalledTimes(1);
    expect(reportRunStatusService.finish).toHaveBeenCalledTimes(1);
  });

  it('still calls finish() even when a step throws, so the app never gets stuck "busy"', async () => {
    statusReportService.runReport.mockRejectedValue(new Error('Claude down'));

    await expect(service.runBoth()).rejects.toThrow('Claude down');

    expect(reportRunStatusService.finish).toHaveBeenCalledTimes(1);
  });

  it('does not run manager-characteristics at all if status-report itself throws', async () => {
    statusReportService.runReport.mockRejectedValue(new Error('Claude down'));

    await expect(service.runBoth()).rejects.toThrow();

    expect(managerCharacteristicsService.runSummary).not.toHaveBeenCalled();
  });

  it('sends a start message and a completion confirmation on a clean run', async () => {
    await service.runBoth();

    const texts = telegramService.sendMessage.mock.calls.map(([text]) => text);
    expect(texts.some((t) => t.includes('Начинаем формирование отчёта'))).toBe(true);
    expect(texts.some((t) => t.includes('Отчёт полностью сформирован'))).toBe(true);
  });

  it('does not send the completion confirmation if a step failed', async () => {
    statusReportService.runReport.mockRejectedValue(new Error('Claude down'));

    await expect(service.runBoth()).rejects.toThrow();

    const texts = telegramService.sendMessage.mock.calls.map(([text]) => text);
    expect(texts.some((t) => t.includes('Отчёт полностью сформирован'))).toBe(false);
  });
});
