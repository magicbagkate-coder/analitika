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

  it('writes one row per reply, carrying the chat, source and who answered', async () => {
    await service.tryRecord({ chatId: 'c1', source: 'product_selection', replies: [reply('m1', 'Аня', 5), reply('m2', 'Оля', 12.5)] });

    expect(builder.values).toHaveBeenCalledWith([
      expect.objectContaining({ chatId: 'c1', messageId: 'm1', managerName: 'Аня', source: 'product_selection', minutes: 5 }),
      expect.objectContaining({ chatId: 'c1', messageId: 'm2', managerName: 'Оля', source: 'product_selection', minutes: 12.5 }),
    ]);
  });

  it('ignores a reply already stored, instead of failing or duplicating it (each run re-reads a 72h window)', async () => {
    await service.tryRecord({ chatId: 'c1', source: 'order_created', replies: [reply('m1', 'Аня', 5)] });

    expect(builder.orIgnore).toHaveBeenCalledTimes(1);
  });

  it('does not touch the database when there is nothing to record', async () => {
    await service.tryRecord({ chatId: 'c1', source: 'product_selection', replies: [] });

    expect(repository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('never throws when the insert fails, so the evaluation that already succeeded is not broken', async () => {
    builder.execute.mockRejectedValue(new Error('connection refused'));

    await expect(service.tryRecord({ chatId: 'c1', source: 'product_selection', replies: [reply('m1', 'Аня', 5)] })).resolves.toBeUndefined();
  });
});
