import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatService } from './sitniks-chat.service';
import type { ChatDetails } from './sitniks-chat.types';

describe('SitniksChatService', () => {
  let service: SitniksChatService;
  let client: { get: jest.Mock };

  beforeEach(async () => {
    client = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatService);
  });

  it('fetches a single chat by id', async () => {
    const chat = { id: 'abc' } as ChatDetails;
    client.get.mockResolvedValue(chat);

    const result = await service.getChat('abc');

    expect(client.get).toHaveBeenCalledWith('/open-api/chats/abc');
    expect(result).toBe(chat);
  });
});
