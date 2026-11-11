import { buildManagerScoresTable, buildManagerSpeedTable, buildShiftsTable, getReportSlot } from './sheet-tables';
import type { ScoreRow } from './sheets-export.types';

// Kyiv is UTC+2 in November: the 15:45 report is 13:45Z, the 23:45 report is 21:45Z.
const MORNING_RUN = new Date('2026-11-09T14:10:00.000Z');
const MORNING_RUN_LATER = new Date('2026-11-09T16:30:00.000Z');
const EVENING_RUN = new Date('2026-11-09T22:05:00.000Z');
const EVENING_RUN_PAST_MIDNIGHT = new Date('2026-11-09T23:40:00.000Z');

function scoreRow(params: { managers: string[]; score: number; recordedAt: Date }): ScoreRow {
  return { managerNames: params.managers, score: params.score, recordedAt: params.recordedAt };
}

describe('getReportSlot', () => {
  it('assigns an evaluation to the report that was running when it was recorded, however long the run took', () => {
    expect(getReportSlot(MORNING_RUN).toISOString()).toBe('2026-11-09T13:45:00.000Z');
    expect(getReportSlot(MORNING_RUN_LATER).toISOString()).toBe('2026-11-09T13:45:00.000Z');
  });

  it('keeps an evaluation recorded after midnight with the 23:45 run it belongs to', () => {
    expect(getReportSlot(EVENING_RUN_PAST_MIDNIGHT).toISOString()).toBe('2026-11-09T21:45:00.000Z');
    expect(getReportSlot(new Date('2026-11-10T00:30:00.000Z')).toISOString()).toBe('2026-11-09T21:45:00.000Z');
  });
});

describe('buildShiftsTable', () => {
  it('counts chats, averages the score and counts each score per report, oldest report first', () => {
    const table = buildShiftsTable([
      scoreRow({ managers: ['Марія'], score: 4, recordedAt: EVENING_RUN }),
      scoreRow({ managers: ['Марія'], score: 5, recordedAt: MORNING_RUN }),
      scoreRow({ managers: ['Оля'], score: 3, recordedAt: MORNING_RUN_LATER }),
    ]);

    expect(table.values[0]).toEqual(['Отчёт', 'Чатов', 'Средняя оценка', 'Оценка 1', 'Оценка 2', 'Оценка 3', 'Оценка 4', 'Оценка 5']);
    expect(table.values[1]).toEqual(['09.11 15:45', 2, 4, 0, 0, 1, 0, 1]);
    expect(table.values[2]).toEqual(['09.11 23:45', 1, 4, 0, 0, 0, 1, 0]);
  });
});

describe('buildManagerScoresTable', () => {
  it('gives each manager of a chat the chat score and averages per day, leaving a blank where a manager had no chats', () => {
    const table = buildManagerScoresTable([
      scoreRow({ managers: ['Оля', 'Марія'], score: 5, recordedAt: MORNING_RUN }),
      scoreRow({ managers: ['Оля'], score: 3, recordedAt: EVENING_RUN }),
      scoreRow({ managers: ['Оля'], score: 4, recordedAt: new Date('2026-11-10T14:10:00.000Z') }),
    ]);

    expect(table.values[0]).toEqual(['День', 'Марія', 'Оля']);
    expect(table.values[1]).toEqual(['09.11', 5, 4]);
    expect(table.values[2]).toEqual(['10.11', '', 4]);
  });
});

describe('buildManagerSpeedTable', () => {
  it('merges the two shifts of a day weighted by the number of replies', () => {
    const table = buildManagerSpeedTable([
      { slot: new Date('2026-11-09T13:45:00.000Z'), speeds: [{ managerName: 'Оля', replies: 10, averageMinutes: 2 }] },
      {
        slot: new Date('2026-11-09T21:45:00.000Z'),
        speeds: [
          { managerName: 'Оля', replies: 30, averageMinutes: 6 },
          { managerName: 'Марія', replies: 5, averageMinutes: 3.04 },
        ],
      },
    ]);

    expect(table.values[0]).toEqual(['День', 'Марія', 'Оля']);
    expect(table.values[1]).toEqual(['09.11', 3, 5]);
  });
});
