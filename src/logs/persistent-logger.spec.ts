import { ConsoleLogger } from '@nestjs/common';
import { LogsService } from './logs.service';
import { PersistentLogger } from './persistent-logger';

describe('PersistentLogger', () => {
  let logger: PersistentLogger;
  let logsService: { record: jest.Mock };
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    logsService = { record: jest.fn() };
    logger = new PersistentLogger(logsService as unknown as LogsService);
    // ConsoleLogger writes via process.stdout/stderr under the hood, not console.log directly —
    // spy on the base class methods instead to confirm console behaviour is still invoked unchanged.
    consoleLogSpy = jest.spyOn(ConsoleLogger.prototype, 'log').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('still calls through to the real console output for a normal log', () => {
    logger.log('hello', 'TestService');
    expect(consoleLogSpy).toHaveBeenCalledWith('hello', 'TestService');
  });

  it('persists a log call with its context extracted from the last argument', () => {
    logger.log('hello', 'TestService');
    expect(logsService.record).toHaveBeenCalledWith({ level: 'log', context: 'TestService', message: 'hello', trace: null });
  });

  it('persists with a null context when none was passed', () => {
    logger.log('hello');
    expect(logsService.record).toHaveBeenCalledWith({ level: 'log', context: null, message: 'hello', trace: null });
  });

  it('extracts the stack trace on an error call (trace first, context last)', () => {
    logger.error('boom', 'stack trace here', 'TestService');
    expect(logsService.record).toHaveBeenCalledWith({
      level: 'error',
      context: 'TestService',
      message: 'boom',
      trace: 'stack trace here',
    });
  });

  it('does not mistake a single optional param for a trace on an error call (that is the context)', () => {
    logger.error('boom', 'TestService');
    expect(logsService.record).toHaveBeenCalledWith({ level: 'error', context: 'TestService', message: 'boom', trace: null });
  });

  it('stringifies a non-string message rather than storing "[object Object]"', () => {
    logger.log({ chatId: 'abc', score: 4 }, 'TestService');
    const [args] = logsService.record.mock.calls;
    expect(args[0].message).toBe('{"chatId":"abc","score":4}');
  });

  it('never throws even if the underlying logsService.record itself throws synchronously', () => {
    logsService.record.mockImplementation(() => {
      throw new Error('DB is down');
    });

    expect(() => logger.warn('something', 'TestService')).not.toThrow();
  });

  it('routes each level to its own record call', () => {
    logger.warn('w', 'C');
    logger.debug('d', 'C');
    logger.verbose('v', 'C');

    const levels = logsService.record.mock.calls.map(([call]) => call.level);
    expect(levels).toEqual(['warn', 'debug', 'verbose']);
  });
});
