import { formatShiftWindow, getShiftWindow } from './shift-window';

describe('getShiftWindow', () => {
  it('for the 15:45 report covers 23:45 the evening before up to 15:45 (Kyiv, UTC+3)', () => {
    const window = getShiftWindow(new Date('2026-09-21T12:45:40.000Z'));

    expect(window.since.toISOString()).toBe('2026-09-20T20:45:00.000Z');
    expect(window.until.toISOString()).toBe('2026-09-21T12:45:00.000Z');
  });

  it('for the 23:45 report covers 15:45 up to 23:45', () => {
    const window = getShiftWindow(new Date('2026-09-21T20:45:40.000Z'));

    expect(window.since.toISOString()).toBe('2026-09-21T12:45:00.000Z');
    expect(window.until.toISOString()).toBe('2026-09-21T20:45:00.000Z');
  });

  it('uses the scheduled time, not the run start, so consecutive shifts neither overlap nor leave a gap', () => {
    const morning = getShiftWindow(new Date('2026-09-21T12:45:59.000Z'));
    const evening = getShiftWindow(new Date('2026-09-21T20:46:30.000Z'));

    expect(evening.since.getTime()).toBe(morning.until.getTime());
  });

  it('a run started by hand between reports covers the last finished shift', () => {
    const window = getShiftWindow(new Date('2026-09-21T11:00:00.000Z'));

    expect(window.since.toISOString()).toBe('2026-09-20T12:45:00.000Z');
    expect(window.until.toISOString()).toBe('2026-09-20T20:45:00.000Z');
  });

  it('stays correct on the day the clocks go back (2026-10-25): the 15:45 report is 13:45 UTC there', () => {
    const window = getShiftWindow(new Date('2026-10-25T13:46:00.000Z'));

    expect(window.until.toISOString()).toBe('2026-10-25T13:45:00.000Z');
    expect(window.since.toISOString()).toBe('2026-10-24T20:45:00.000Z');
  });
});

describe('formatShiftWindow', () => {
  it('shows the day and the Kyiv clock times of both ends', () => {
    const label = formatShiftWindow({ since: new Date('2026-09-20T20:45:00.000Z'), until: new Date('2026-09-21T12:45:00.000Z') });

    expect(label).toBe('21.09, с 23:45 до 15:45');
  });
});
