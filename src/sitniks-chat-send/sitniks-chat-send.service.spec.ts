import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatSendService } from './sitniks-chat-send.service';

describe('SitniksChatSendService', () => {
  let service: SitniksChatSendService;
  let client: { post: jest.Mock };

  beforeEach(async () => {
    client = { post: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatSendService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatSendService);
  });

  it('posts text and attachments to the chat and reports sent', async () => {
    client.post.mockResolvedValue({});
    const result = await service.sendMessage({ chatId: 'c1', attachments: ['https://x/a.mp4'] });
    expect(client.post).toHaveBeenCalledWith('/open-api/chats/c1/messages', { text: undefined, attachments: ['https://x/a.mp4'] });
    expect(result.outcome).toBe('sent');
  });

  it('calls a 4xx answer rejected: nothing reached the client', async () => {
    client.post.mockRejectedValue({ response: { status: 400 } });
    expect((await service.sendMessage({ chatId: 'c1', text: 'hi' })).outcome).toBe('rejected');
  });

  it('calls a 5xx answer uncertain, and never retries it', async () => {
    client.post.mockRejectedValue({ response: { status: 500 } });
    expect((await service.sendMessage({ chatId: 'c1', text: 'hi' })).outcome).toBe('uncertain');
    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('calls a timeout with no response uncertain', async () => {
    client.post.mockRejectedValue({ message: 'timeout of 30000ms exceeded' });
    expect((await service.sendMessage({ chatId: 'c1', text: 'hi' })).outcome).toBe('uncertain');
  });
});
