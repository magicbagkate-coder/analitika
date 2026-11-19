import { buildTrashCheckedTag, hasTrashSignal, needsTrashCheck, withoutTrashCheckedTags } from './trash-stories.constants';

describe('hasTrashSignal', () => {
  it('catches a return or a claim in a client message', () => {
    expect(hasTrashSignal(['Добрий день', 'Хочу повернути сумку, вона не шкіряна'])).toBe(true);
    expect(hasTrashSignal(['Це брак, я напишу скаргу'])).toBe(true);
  });

  it('ignores an ordinary sales conversation', () => {
    expect(hasTrashSignal(['Яка ціна?', 'Чорний колір', 'Дякую, подумаю'])).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasTrashSignal(['ПОВЕРНЕННЯ коштів'])).toBe(true);
  });
});

describe('needsTrashCheck', () => {
  it('judges a chat that was never judged', () => {
    expect(needsTrashCheck(['оценка-4'], 'm2')).toBe(true);
  });

  it('skips a chat whose newest message was already judged', () => {
    expect(needsTrashCheck(['trash-msg-m2'], 'm2')).toBe(false);
  });

  it('judges a chat again once a newer message arrived', () => {
    expect(needsTrashCheck([buildTrashCheckedTag('m1')], 'm2')).toBe(true);
  });
});

describe('withoutTrashCheckedTags', () => {
  it('drops only the trash marker and keeps every other tag', () => {
    expect(withoutTrashCheckedTags(['оценка-5', 'trash-msg-m1', 'msg-m9'])).toEqual(['оценка-5', 'msg-m9']);
  });
});
