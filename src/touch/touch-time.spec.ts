import { getClosingCutoff, getTouchTag, isInsideTouchWindow } from './touch-time';

// Kyiv is UTC+2 in November.
describe('isInsideTouchWindow', () => {
  it('is open from 09:00 and closed from 23:00 Kyiv time', () => {
    expect(isInsideTouchWindow(new Date('2026-11-25T06:59:00.000Z'))).toBe(false); // 08:59
    expect(isInsideTouchWindow(new Date('2026-11-25T07:00:00.000Z'))).toBe(true); // 09:00
    expect(isInsideTouchWindow(new Date('2026-11-25T20:59:00.000Z'))).toBe(true); // 22:59
    expect(isInsideTouchWindow(new Date('2026-11-25T21:00:00.000Z'))).toBe(false); // 23:00
  });
});

describe('getClosingCutoff', () => {
  it('is 22:00 Kyiv time of the previous day', () => {
    expect(getClosingCutoff(new Date('2026-11-25T06:00:00.000Z')).toISOString()).toBe('2026-11-24T20:00:00.000Z');
  });

  it('is the same cutoff for any moment of the day', () => {
    expect(getClosingCutoff(new Date('2026-11-25T18:30:00.000Z')).toISOString()).toBe('2026-11-24T20:00:00.000Z');
  });

  it('follows the Kyiv day, not the UTC day, just after midnight', () => {
    // 00:30 Kyiv on 26.11 is still 22:30Z on 25.11.
    expect(getClosingCutoff(new Date('2026-11-25T22:30:00.000Z')).toISOString()).toBe('2026-11-25T20:00:00.000Z');
  });
});

describe('getTouchTag', () => {
  it('is the first touch before 16:00 Kyiv time and the second from 16:00', () => {
    expect(getTouchTag(new Date('2026-11-25T07:00:00.000Z'))).toBe('касание 1'); // 09:00
    expect(getTouchTag(new Date('2026-11-25T13:59:00.000Z'))).toBe('касание 1'); // 15:59
    expect(getTouchTag(new Date('2026-11-25T14:00:00.000Z'))).toBe('касание 2'); // 16:00
    expect(getTouchTag(new Date('2026-11-25T20:30:00.000Z'))).toBe('касание 2'); // 22:30
  });
});
