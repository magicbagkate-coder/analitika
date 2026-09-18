import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatUpdateService } from './sitniks-chat-update.service';

describe('SitniksChatUpdateService', () => {
  let service: SitniksChatUpdateService;
  let client: { put: jest.Mock };

  beforeEach(async () => {
    client = { put: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatUpdateService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatUpdateService);
  });

  it('PUTs tags to the per-chat endpoint', async () => {
    client.put.mockResolvedValue(undefined);

    await service.updateChat({ chatId: 'abc', tags: ['оценка-4', 'msg-1'] });

    expect(client.put).toHaveBeenCalledWith('/open-api/chats/abc', { tags: ['оценка-4', 'msg-1'], assignedManagerId: undefined });
  });

  it('includes assignedManagerId when reassigning a manager', async () => {
    client.put.mockResolvedValue(undefined);

    await service.updateChat({ chatId: 'abc', tags: [], assignedManagerId: 42 });

    expect(client.put).toHaveBeenCalledWith('/open-api/chats/abc', { tags: [], assignedManagerId: 42 });
  });
});
