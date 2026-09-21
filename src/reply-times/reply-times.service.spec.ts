import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReplyTimeEntity } from './reply-time.entity';
import { ReplyTimesService } from './reply-times.service';
import type { ReplyInterval } from '../evaluation/response-time';

function reply(messageId: string, managerName: string, minutes: number): ReplyInterval {
  return {
    messageId,
    managerName,
    clientMessageAt: new Date('2026-09-18T10:00:00.000Z'),
    repliedAt: new Date('2026-09-18T10:05:00.000Z'),
    minutes,
  };
}

describe('ReplyTimesService', () => {
  let service: ReplyTimesService;
  let builder: { insert: jest.Mock; values: jest.Mock; orIgnore: jest.Mock; execute: jest.Mock };
  let repository: { createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    builder = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    repository = { createQueryBuilder: jest.fn().mockReturnValue(builder) };

    const module = await Test.createTestingModule({
      providers: [ReplyTimesService, { provide: getRepositoryToken(ReplyTimeEntity), useValue: repository }],
    }).compile();
    service = module.get(ReplyTimesService);
  });

  it('does not touch the database while replies are only queued (the report is still being built)', () => {
    service.queue({ chatId: 'c1', source: 'product_selection', replies: [reply('m1', 'Аня', 5)] });

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('writes every queued reply on flush, carrying the chat, source and who answered', async () => {
    service.queue({ chatId: 'c1', source: 'product_selection', replies: [reply('m1', 'Аня', 5)] });
    service.queue({ chatId: 'c2', source: 'order_created', replies: [reply('m2', 'Оля', 12.5)] });

    await service.flush();

    expect(builder.values).toHaveBeenCalledTimes(1);
    expect(builder.values).toHaveBeenCalledWith([
      expect.objectContaining({ chatId: 'c1', messageId: 'm1', managerName: 'Аня', source: 'product_selection', minutes: 5 }),
      expect.objectContaining({ chatId: 'c2', messageId: 'm2', managerName: 'Оля', source: 'order_created', minutes: 12.5 }),
    ]);
  });

  it('ignores a reply already stored, instead of failing or duplicating it (each run re-reads a 72h window)', async () => {
    service.queue({ chatId: 'c1', source: 'order_created', replies: [reply('m1', 'Аня', 5)] });

    await service.flush();

    expect(builder.orIgnore).toHaveBeenCalledTimes(1);
  });

  it('does not touch the database when nothing was queued', async () => {
    await service.flush();

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('writes a queued reply only once, even if flush is called twice', async () => {
    service.queue({ chatId: 'c1', source: 'product_selection', replies: [reply('m1', 'Аня', 5)] });

    await service.flush();
    await service.flush();

    expect(builder.execute).toHaveBeenCalledTimes(1);
  });

  it('splits a large batch into several inserts, staying under the database parameter limit', async () => {
    const replies = Array.from({ length: 1200 }, (_, index) => reply(`m${index}`, 'Аня', 1));
    service.queue({ chatId: 'c1', source: 'product_selection', replies });

    await service.flush();

    expect(builder.execute).toHaveBeenCalledTimes(3);
  });

  it('never throws when an insert fails, and still tries the remaining batches', async () => {
    const replies = Array.from({ length: 600 }, (_, index) => reply(`m${index}`, 'Аня', 1));
    service.queue({ chatId: 'c1', source: 'product_selection', replies });
    builder.execute.mockRejectedValueOnce(new Error('connection refused'));

    await expect(service.flush()).resolves.toBeUndefined();

    expect(builder.execute).toHaveBeenCalledTimes(2);
  });
});
