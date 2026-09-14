import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { CreateNoteParams, Note } from './sitniks-chat-notes.types';

/** Wraps POST /open-api/chats/{chatId}/notes — adding a note to a chat, nothing else. */
@Injectable()
export class SitniksChatNotesService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async createNote(params: CreateNoteParams): Promise<Note> {
    return this.sitniksClient.post<Note, { text: string }>(`/open-api/chats/${params.chatId}/notes`, {
      text: params.note,
    });
  }
}
