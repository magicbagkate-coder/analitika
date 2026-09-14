export type CreateNoteParams = {
  chatId: string;
  note: string;
};

/** Confirmed against Sitniks' `NoteOpenApiEntity` schema — the note body is `text`, not `note`. */
export type Note = {
  text: string;
  managerName: string;
  createdAt: string;
};
