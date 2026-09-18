import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksChatNotesService } from './sitniks-chat-notes.service';
import type { Note } from './sitniks-chat-notes.types';

describe('SitniksChatNotesService', () => {
  let service: SitniksChatNotesService;
  let client: { post: jest.Mock };

  beforeEach(async () => {
    client = { post: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksChatNotesService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksChatNotesService);
  });

  it('POSTs the note text (renamed from `note` to `text`) to the per-chat notes endpoint', async () => {
    const note: Note = { text: 'Порекомендувати аксесуар', managerName: 'Аня', createdAt: '2026-09-18T10:00:00.000Z' };
    client.post.mockResolvedValue(note);

    const result = await service.createNote({ chatId: 'abc', note: 'Порекомендувати аксесуар' });

    expect(client.post).toHaveBeenCalledWith('/open-api/chats/abc/notes', { text: 'Порекомендувати аксесуар' });
    expect(result).toBe(note);
  });
});
