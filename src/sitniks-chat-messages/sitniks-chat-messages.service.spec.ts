import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatMessagesService } from './sitniks-chat-messages.service';
import type { ListChatMessagesResponse } from './sitniks-chat-messages.types';

describe('SitniksChatMessagesService', () => {
  let service: SitniksChatMessagesService;
  let client: { get: jest.Mock };

  beforeEach(async () => {
    client = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatMessagesService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatMessagesService);
  });

  it('builds the per-chat messages URL and forwards the rest of the params as the query', async () => {
    const response: ListChatMessagesResponse = { data: [] };
    client.get.mockResolvedValue(response);

    const result = await service.listMessages({ chatId: 'abc123', limit: 50 });

    expect(client.get).toHaveBeenCalledWith('/open-api/chats/abc123/messages', { limit: 50 });
    expect(result).toEqual(response);
  });

  it('drops internal notes but keeps standard and scope-less messages', async () => {
    const base = { sentBy: 's', text: 't', createdAt: '2026-10-14T06:49:48.617Z', isViewedByUser: true };
    client.get.mockResolvedValue({
      data: [
        { ...base, id: 'a', messageScope: 'standard' },
        { ...base, id: 'b', messageScope: 'internal_note' },
        { ...base, id: 'c' },
      ],
    });

    const result = await service.listMessages({ chatId: 'abc123' });

    expect(result.data.map((message) => message.id)).toEqual(['a', 'c']);
  });

  it('does not leak chatId into the query params', async () => {
    client.get.mockResolvedValue({ data: [] });

    await service.listMessages({ chatId: 'xyz', skip: 10 });

    const [, query] = client.get.mock.calls[0];
    expect(query).not.toHaveProperty('chatId');
    expect(query).toEqual({ skip: 10 });
  });
});
