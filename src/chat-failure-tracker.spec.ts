import { ChatFailureTracker } from './chat-failure-tracker';

describe('ChatFailureTracker', () => {
  it('returns no warning when nothing failed', () => {
    expect(new ChatFailureTracker().formatWarning('Отчёт', 10)).toBe('');
  });

  it('counts failures and reports the first error, HTML-escaped', () => {
    const tracker = new ChatFailureTracker();
    tracker.record(new Error('credit balance <too low>'));
    tracker.record(new Error('second'));

    const warning = tracker.formatWarning('Отчёт', 177);

    expect(tracker.failedCount).toBe(2);
    expect(warning).toContain('2 из 177');
    expect(warning).toContain('credit balance &lt;too low&gt;');
    expect(warning).not.toContain('second');
  });
});
