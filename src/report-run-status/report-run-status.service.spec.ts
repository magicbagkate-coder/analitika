import { ReportRunStatusService } from './report-run-status.service';

describe('ReportRunStatusService', () => {
  let service: ReportRunStatusService;

  beforeEach(() => {
    service = new ReportRunStatusService();
  });

  it('is not busy before start() is ever called', () => {
    expect(service.isBusy()).toBe(false);
  });

  it('is busy right after start()', () => {
    service.start();
    expect(service.isBusy()).toBe(true);
  });

  it('is not busy after finish()', () => {
    service.start();
    service.finish();
    expect(service.isBusy()).toBe(false);
  });

  it('treats a run older than the 6h ceiling as stale, not busy', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-18T10:00:00.000Z'));
    service.start();

    jest.setSystemTime(new Date('2026-09-18T16:00:01.000Z')); // 6h and 1s later
    expect(service.isBusy()).toBe(false);

    jest.useRealTimers();
  });

  it('is still busy just under the 6h ceiling', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-18T10:00:00.000Z'));
    service.start();

    jest.setSystemTime(new Date('2026-09-18T15:59:00.000Z')); // just under 6h later
    expect(service.isBusy()).toBe(true);

    jest.useRealTimers();
  });
});
