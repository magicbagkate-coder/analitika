import { buildConflictAlertTag, hasConflictSignal, needsConflictAlert, withoutConflictAlertTags } from './conflict-watcher.constants';

describe('hasConflictSignal', () => {
  it('matches a Ukrainian keyword regardless of case', () => {
    expect(hasConflictSignal('Будь ласка, ЗУПИНІТЬСЯ писати мені')).toBe(true);
  });

  it('matches a Russian keyword', () => {
    expect(hasConflictSignal('вы меня уже достали своими сообщениями')).toBe(true);
  });

  it('is false for ordinary text with no keyword', () => {
    expect(hasConflictSignal('дякую, все зрозуміло, чекаю доставку')).toBe(false);
  });

  it('still matches a keyword that is a substring inside a longer word', () => {
    expect(hasConflictSignal('навязчивость это уже слишком')).toBe(true);
  });
});

describe('needsConflictAlert', () => {
  it('needs an alert when this message was never alerted on', () => {
    expect(needsConflictAlert([], 'msg1')).toBe(true);
  });

  it('does not need an alert when this exact message already triggered one', () => {
    expect(needsConflictAlert([buildConflictAlertTag('msg1')], 'msg1')).toBe(false);
  });

  it('needs a fresh alert for a newer message even if an older one was already alerted', () => {
    expect(needsConflictAlert([buildConflictAlertTag('msg1')], 'msg2')).toBe(true);
  });
});

describe('withoutConflictAlertTags', () => {
  it('strips old alert tags but keeps everything else', () => {
    const tags = [buildConflictAlertTag('msg1'), 'оценка-4', 'важливий'];
    expect(withoutConflictAlertTags(tags)).toEqual(['оценка-4', 'важливий']);
  });
});
