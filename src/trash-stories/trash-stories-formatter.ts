import { chunkIntoMessages, escapeHtml } from '../telegram/telegram-format';
import type { TrashStory } from './trash-stories.types';

/**
 * Telegram HTML, same emoji + bold style as the rest of the run. Owner's instruction (2026-11-19): the
 * block goes out after EVERY shift, so an empty shift is stated explicitly instead of staying silent.
 * `shiftLabel` is the shift window as the other shift messages show it, e.g. "21.09, с 23:45 до 15:45".
 */
export function formatTrashStories(params: { stories: TrashStory[]; shiftLabel: string }): string[] {
  const title = `🗑<b>Трэш истории</b> (${escapeHtml(params.shiftLabel)})`;
  if (params.stories.length === 0) return [`${title}\nТрэш историй за эту смену не найдено.`];

  return chunkIntoMessages(title, params.stories.map((story) => formatOneStory(story)));
}

function formatOneStory(story: TrashStory): string {
  const header = `<b>${escapeHtml(story.clientName)}</b> — ${escapeHtml(story.category)} (${escapeHtml(story.status)})`;
  return [header, escapeHtml(story.summary)].join('\n');
}
