import { Test } from '@nestjs/testing';
import * as fs from 'node:fs/promises';
import { SitniksChatListService } from '../sitniks-chat-list/sitniks-chat-list.service';
import { SitniksChatUpdateService } from '../sitniks-chat-update/sitniks-chat-update.service';
import { BulkTagStatusService } from './bulk-tag-status.service';

jest.mock('node:fs/promises');

describe('BulkTagStatusService', () => {
  let service: BulkTagStatusService;
  let chatListService: { listChats: jest.Mock };
  let chatUpdateService: { updateChat: jest.Mock };
  const fsMock = fs as jest.Mocked<typeof fs>;

  beforeEach(async () => {
    jest.clearAllMocks();
    chatListService = { listChats: jest.fn() };
    chatUpdateService = { updateChat: jest.fn().mockResolvedValue(undefined) };
    fsMock.mkdir.mockResolvedValue(undefined as unknown as string);
    fsMock.writeFile.mockResolvedValue(undefined);

    const module = await Test.createTestingModule({
      providers: [
        BulkTagStatusService,
        { provide: SitniksChatListService, useValue: chatListService },
        { provide: SitniksChatUpdateService, useValue: chatUpdateService },
      ],
    }).compile();
    service = module.get(BulkTagStatusService);
  });

  it('does nothing if the done marker already exists', async () => {
    fsMock.access.mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(chatListService.listChats).not.toHaveBeenCalled();
  });

  it('tags every chat that does not already carry the "1" tag', async () => {
    fsMock.access.mockRejectedValue(new Error('not found'));
    chatListService.listChats.mockResolvedValue({
      data: [
        { id: 'a', tags: [] },
        { id: 'b', tags: ['1'] },
      ],
      count: 2,
    });

    await service.onModuleInit();

    expect(chatUpdateService.updateChat).toHaveBeenCalledWith({ chatId: 'a', tags: ['1'] });
    expect(chatUpdateService.updateChat).toHaveBeenCalledWith({ chatId: 'b', tags: ['1'] });
  });

  it('keeps tagging the rest of the batch even if one chat fails, and still writes the done marker', async () => {
    fsMock.access.mockRejectedValue(new Error('not found'));
    chatListService.listChats.mockResolvedValue({
      data: [
        { id: 'fails', tags: [] },
        { id: 'ok', tags: [] },
      ],
      count: 2,
    });
    chatUpdateService.updateChat.mockImplementation(({ chatId }: { chatId: string }) =>
      chatId === 'fails' ? Promise.reject(new Error('Sitniks 500')) : Promise.resolve(undefined),
    );

    await service.onModuleInit();

    expect(chatUpdateService.updateChat).toHaveBeenCalledTimes(2);
    // Fetching the list itself succeeded, so the run is considered complete and the marker is written
    // even though one individual chat failed — that's tracked in the log, not by skipping the marker.
    expect(fsMock.writeFile).toHaveBeenCalledWith(expect.stringContaining('.done'), expect.any(String), 'utf-8');
  });

  it('does not write the done marker if fetching the chat list itself fails', async () => {
    fsMock.access.mockRejectedValue(new Error('not found'));
    chatListService.listChats.mockRejectedValue(new Error('Sitniks unreachable'));

    await service.onModuleInit();

    const doneMarkerWrites = fsMock.writeFile.mock.calls.filter((call) => String(call[0]).includes('.done'));
    expect(doneMarkerWrites).toHaveLength(0);
  });
});
