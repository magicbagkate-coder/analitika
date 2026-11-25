import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatStatusService } from './sitniks-chat-status.service';

describe('SitniksChatStatusService', () => {
  it('patches the status of the given chat with the plain status name', async () => {
    const client = { patch: jest.fn().mockResolvedValue(undefined) };
    const module = await Test.createTestingModule({
      providers: [SitniksChatStatusService, { provide: SitniksClientService, useValue: client }],
    }).compile();

    await module.get(SitniksChatStatusService).changeStatus({ chatId: 'abc123', status: 'Завершено' });

    expect(client.patch).toHaveBeenCalledWith('/open-api/chats/abc123/status', { status: 'Завершено' });
  });
});
