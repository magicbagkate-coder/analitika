import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatListService } from './sitniks-chat-list.service';
import type { ListChatsResponse } from './sitniks-chat-list.types';

describe('SitniksChatListService', () => {
  let service: SitniksChatListService;
  let client: { get: jest.Mock };

  beforeEach(async () => {
    client = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatListService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatListService);
  });

  it('calls GET /open-api/chats with the given filters and returns the response as-is', async () => {
    const response: ListChatsResponse = { data: [], count: 0 };
    client.get.mockResolvedValue(response);

    const result = await service.listChats({ status: 'Вибір товару', limit: 50 });

    expect(client.get).toHaveBeenCalledWith('/open-api/chats', { status: 'Вибір товару', limit: 50 });
    expect(result).toBe(response);
  });
});
