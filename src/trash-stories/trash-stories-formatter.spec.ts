import { formatTrashStories } from './trash-stories-formatter';
import type { TrashStory } from './trash-stories.types';

const shiftLabel = '21.09, с 23:45 до 15:45';

const story: TrashStory = {
  chatId: 'c1',
  clientName: 'anna_k',
  status: 'Повернення',
  category: 'повреждение и возврат',
  summary: 'Вернула сумку с порезом, утверждает, что она не кожаная.',
};

describe('formatTrashStories', () => {
  it('says explicitly that nothing was found for the shift, instead of staying silent', () => {
    const messages = formatTrashStories({ stories: [], shiftLabel });

    expect(messages).toEqual([`🗑<b>Трэш истории</b> (${shiftLabel})
Трэш историй за эту смену не найдено.`]);
  });

  it('titles the block "Трэш истории" and shows client, category, status and summary', () => {
    const [message] = formatTrashStories({ stories: [story], shiftLabel });

    expect(message).toContain(`<b>Трэш истории</b> (${shiftLabel})`);
    expect(message).toContain('<b>anna_k</b> — повреждение и возврат (Повернення)');
    expect(message).toContain('Вернула сумку с порезом');
  });

  it('escapes HTML in client names and summaries', () => {
    const [message] = formatTrashStories({ stories: [{ ...story, clientName: 'A&B', summary: 'цена < 100' }], shiftLabel });

    expect(message).toContain('A&amp;B');
    expect(message).toContain('цена &lt; 100');
  });

  it('splits a long list into several messages instead of cutting one in half', () => {
    const many = Array.from({ length: 30 }, (_, index) => ({ ...story, chatId: `c${index}`, summary: 'x'.repeat(400) }));

    const messages = formatTrashStories({ stories: many, shiftLabel });

    expect(messages.length).toBeGreaterThan(1);
    messages.forEach((message) => expect(message.length).toBeLessThan(4096));
  });
});
