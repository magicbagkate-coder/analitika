import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LessThan } from 'typeorm';
import { LogEntryEntity } from './log-entry.entity';
import { LogsService } from './logs.service';

describe('LogsService', () => {
  let service: LogsService;
  let repository: { insert: jest.Mock; delete: jest.Mock };
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(async () => {
    repository = { insert: jest.fn().mockResolvedValue(undefined), delete: jest.fn().mockResolvedValue({ affected: 0 }) };
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const module = await Test.createTestingModule({
      providers: [LogsService, { provide: getRepositoryToken(LogEntryEntity), useValue: repository }],
    }).compile();
    service = module.get(LogsService);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('record', () => {
    it('inserts the entry, coercing a missing trace to null', () => {
      service.record({ level: 'log', context: 'TestService', message: 'hello' });

      expect(repository.insert).toHaveBeenCalledWith({ level: 'log', context: 'TestService', message: 'hello', trace: null });
    });

    it('preserves an explicit trace', () => {
      service.record({ level: 'error', context: 'TestService', message: 'boom', trace: 'stack...' });

      expect(repository.insert).toHaveBeenCalledWith({ level: 'error', context: 'TestService', message: 'boom', trace: 'stack...' });
    });

    it('does not throw when the insert itself fails, and logs to plain console instead of the app Logger', async () => {
      repository.insert.mockRejectedValue(new Error('connection refused'));

      expect(() => service.record({ level: 'log', context: null, message: 'hi' })).not.toThrow();
      await Promise.resolve(); // let the rejected promise's .catch run
      await Promise.resolve();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('connection refused'));
    });
  });

  describe('cleanupOld', () => {
    it('deletes rows older than 3 days and returns how many were removed', async () => {
      repository.delete.mockResolvedValue({ affected: 42 });

      const removed = await service.cleanupOld();

      expect(repository.delete).toHaveBeenCalledWith({ createdAt: LessThan(expect.any(Date)) });
      expect(removed).toBe(42);
    });

    it('returns 0 instead of undefined when nothing was deleted', async () => {
      repository.delete.mockResolvedValue({ affected: undefined });

      const removed = await service.cleanupOld();

      expect(removed).toBe(0);
    });
  });
});
