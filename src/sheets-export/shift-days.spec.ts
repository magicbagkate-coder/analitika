import { buildShiftDays, getReportSlot } from './shift-days';
import type { ShiftRoster } from '../shifts/shift-roster.constants';
import type { ScoreRow } from './sheets-export.types';

// Kyiv is UTC+2 in November: the 15:45 report is 13:45Z, the 23:45 report is 21:45Z.
const SHIFT: ShiftRoster = {
  shiftKey: 'shift-2',
  tabTitle: 'Смена 2 — Наташа',
  members: [
    { managerName: 'Попович Наталія', roleLabel: 'Старшая смены' },
    { managerName: 'Марія Лисенко', roleLabel: 'Младший менеджер' },
  ],
};

function score(params: { managers: string[]; value: number; at: string }): ScoreRow {
  return { managerNames: params.managers, score: params.value, recordedAt: new Date(params.at) };
}

describe('getReportSlot', () => {
  it('keeps an evaluation recorded after midnight with the 23:45 report it belongs to', () => {
    expect(getReportSlot(new Date('2026-11-11T22:20:00.000Z')).toISOString()).toBe('2026-11-11T21:45:00.000Z');
  });
});

describe('buildShiftDays', () => {
  it('puts a 23:45 report finished after midnight on the day it started, newest day first', () => {
    const days = buildShiftDays({
      shift: SHIFT,
      scores: [
        score({ managers: ['Марія Лисенко'], value: 5, at: '2026-11-10T14:00:00.000Z' }),
        score({ managers: ['Марія Лисенко'], value: 3, at: '2026-11-11T22:20:00.000Z' }),
      ],
      speeds: [],
      texts: [],
    });

    expect(days.map((day) => day.dayKey)).toEqual(['2026-11-11', '2026-11-10']);
    expect(days[0].managers.map((manager) => [manager.managerName, manager.chats, manager.averageScore])).toEqual([['Марія Лисенко', 1, 3]]);
  });

  it('counts only chats of this shift and leaves out managers who did not work that day', () => {
    const days = buildShiftDays({
      shift: SHIFT,
      scores: [
        score({ managers: ['Попович Наталія', 'Ганна Кірієнко'], value: 4, at: '2026-11-11T14:00:00.000Z' }),
        score({ managers: ['Ганна Кірієнко'], value: 1, at: '2026-11-11T14:00:00.000Z' }),
      ],
      speeds: [],
      texts: [],
    });

    expect(days).toHaveLength(1);
    expect(days[0].chats).toBe(1);
    expect(days[0].averageScore).toBe(4);
    expect(days[0].managers.map((manager) => manager.managerName)).toEqual(['Попович Наталія']);
  });

  it('weights the speed by replies, per manager and for the whole shift', () => {
    const days = buildShiftDays({
      shift: SHIFT,
      scores: [],
      speeds: [
        { dayKey: '2026-11-11', managerName: 'Попович Наталія', replies: 3, averageMinutes: 10 },
        { dayKey: '2026-11-11', managerName: 'Марія Лисенко', replies: 1, averageMinutes: 2 },
        { dayKey: '2026-11-11', managerName: 'Ганна Кірієнко', replies: 50, averageMinutes: 90 },
      ],
      texts: [],
    });

    expect(days[0].averageMinutes).toBe(8);
    expect(days[0].managers.map((manager) => manager.averageMinutes)).toEqual([10, 2]);
  });

  it('labels the texts of two reports on one day with their time and keeps only this shift problems', () => {
    const days = buildShiftDays({
      shift: SHIFT,
      scores: [],
      speeds: [],
      texts: [
        { reportAt: new Date('2026-11-11T21:45:00.000Z'), kind: 'manager', subject: 'Марія Лисенко', text: '• вечер' },
        { reportAt: new Date('2026-11-11T13:45:00.000Z'), kind: 'manager', subject: 'Марія Лисенко', text: '• день' },
        { reportAt: new Date('2026-11-11T13:45:00.000Z'), kind: 'shift', subject: 'shift-2', text: '• задержки' },
        { reportAt: new Date('2026-11-11T13:45:00.000Z'), kind: 'shift', subject: 'shift-1', text: '• чужая смена' },
      ],
    });

    expect(days[0].managers[0].text).toBe('Отчёт 15:45:\n• день\n\nОтчёт 23:45:\n• вечер');
    expect(days[0].problemsText).toBe('• задержки');
  });
});
