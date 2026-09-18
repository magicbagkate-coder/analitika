import { Logger } from '@nestjs/common';
import { runWithWatchdog } from './report-watchdog';

describe('runWithWatchdog', () => {
  let logger: Logger;
  let telegramService: { sendMessage: jest.Mock };

  beforeEach(() => {
    logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() } as unknown as Logger;
    telegramService = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  });

  it('resolves with the real result when work finishes well under the timeout', async () => {
    const work = Promise.resolve();
    await expect(runWithWatchdog(work, 'Test step', telegramService as never, logger)).resolves.toBeUndefined();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('propagates a rejection from work as its own rejection', async () => {
    const work = Promise.reject(new Error('boom'));
    await expect(runWithWatchdog(work, 'Test step', telegramService as never, logger)).rejects.toThrow('boom');
  });

  it('sends a Telegram alert and logs an error if work is still pending after 30 minutes', async () => {
    jest.useFakeTimers();
    let resolveWork: () => void;
    const work = new Promise<void>((resolve) => {
      resolveWork = resolve;
    });

    const watchdogPromise = runWithWatchdog(work, 'Slow step', telegramService as never, logger);
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Slow step is still running after 30 minutes'));
    expect(telegramService.sendMessage).toHaveBeenCalledWith(expect.stringContaining('Slow step'));

    resolveWork!();
    await watchdogPromise;
    jest.useRealTimers();
  });

  it('does not alert again once work has already settled before the timeout fires', async () => {
    jest.useFakeTimers();
    const work = Promise.resolve();

    await runWithWatchdog(work, 'Fast step', telegramService as never, logger);
    await jest.advanceTimersByTimeAsync(30 * 60 * 1000);

    expect(logger.error).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
