import { getCanonicalManagerName } from '../evaluation/manager-roles.constants';
import { formatKyivDateKey, getKyivHourMinute } from '../kyiv-time';
import { getShiftWindow } from '../reply-times/shift-window';
import type { DailyManagerSpeed } from '../reply-times/reply-times.types';
import type { ReportTextRow } from '../report-texts/report-texts.types';
import type { ShiftRoster } from '../shifts/shift-roster.constants';
import type { ManagerDay, ScoreRow, ShiftDay } from './sheets-export.types';

type SpeedTotals = { replies: number; weightedMinutes: number };

export type BuildShiftDaysParams = {
  shift: ShiftRoster;
  scores: ScoreRow[];
  speeds: DailyManagerSpeed[];
  texts: ReportTextRow[];
};

/** The report (nominal time, UTC instant) that evaluated something recorded at `recordedAt`. */
export function getReportSlot(recordedAt: Date): Date {
  return getShiftWindow(recordedAt).until;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function averageScore(scores: number[]): number | null {
  if (scores.length === 0) return null;
  return roundTo(scores.reduce((sum, score) => sum + score, 0) / scores.length, 2);
}

function weightedMinutes(speeds: DailyManagerSpeed[]): number | null {
  const totals = speeds.reduce<SpeedTotals>(
    (sum, speed) => ({ replies: sum.replies + speed.replies, weightedMinutes: sum.weightedMinutes + speed.averageMinutes * speed.replies }),
    { replies: 0, weightedMinutes: 0 },
  );
  return totals.replies > 0 ? roundTo(totals.weightedMinutes / totals.replies, 1) : null;
}

function formatReportClock(reportAt: Date): string {
  const { hour, minute } = getKyivHourMinute(reportAt);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/** Texts of one subject on one day, oldest report first; with two reports a day each is labelled by its time. */
function joinTexts(texts: ReportTextRow[]): string {
  const sorted = [...texts].sort((first, second) => first.reportAt.getTime() - second.reportAt.getTime());
  if (sorted.length === 1) return sorted[0].text;
  return sorted.map((text) => `Отчёт ${formatReportClock(text.reportAt)}:\n${text.text}`).join('\n\n');
}

function canonicalNames(row: ScoreRow): string[] {
  return row.managerNames.map(getCanonicalManagerName);
}

/**
 * One entry per Kyiv day on which anyone of the shift has scores, replies or a report text, newest
 * day first. Scores count only chats the manager took part in; speed is weighted by the replies.
 */
export function buildShiftDays(params: BuildShiftDaysParams): ShiftDay[] {
  const memberNames = params.shift.members.map((member) => member.managerName);
  const isMember = (name: string): boolean => memberNames.includes(name);

  const scoresByDay = new Map<string, ScoreRow[]>();
  for (const row of params.scores.filter((score) => canonicalNames(score).some(isMember))) {
    const dayKey = formatKyivDateKey(getReportSlot(row.recordedAt));
    scoresByDay.set(dayKey, [...(scoresByDay.get(dayKey) ?? []), row]);
  }
  const speeds = params.speeds
    .map((speed) => ({ ...speed, managerName: getCanonicalManagerName(speed.managerName) }))
    .filter((speed) => isMember(speed.managerName));
  const texts = params.texts.map((text) => ({ ...text, dayKey: formatKyivDateKey(text.reportAt) }));

  const dayKeys = new Set([...scoresByDay.keys(), ...speeds.map((speed) => speed.dayKey), ...texts.map((text) => text.dayKey)]);
  const shiftDays = [...dayKeys].map((dayKey): ShiftDay => {
    const dayScores = scoresByDay.get(dayKey) ?? [];
    const daySpeeds = speeds.filter((speed) => speed.dayKey === dayKey);
    const dayTexts = texts.filter((text) => text.dayKey === dayKey);

    const managers = params.shift.members.map((member): ManagerDay => {
      const memberScores = dayScores.filter((row) => canonicalNames(row).includes(member.managerName)).map((row) => row.score);
      const memberTexts = dayTexts.filter((text) => text.kind === 'manager' && text.subject === member.managerName);
      return {
        managerName: member.managerName,
        roleLabel: member.roleLabel,
        chats: memberScores.length,
        averageScore: averageScore(memberScores),
        averageMinutes: weightedMinutes(daySpeeds.filter((speed) => speed.managerName === member.managerName)),
        text: memberTexts.length > 0 ? joinTexts(memberTexts) : '',
      };
    });
    const shiftTexts = dayTexts.filter((text) => text.kind === 'shift' && text.subject === params.shift.shiftKey);

    return {
      dayKey,
      chats: dayScores.length,
      averageScore: averageScore(dayScores.map((row) => row.score)),
      averageMinutes: weightedMinutes(daySpeeds),
      problemsText: shiftTexts.length > 0 ? joinTexts(shiftTexts) : '',
      managers: managers.filter((manager) => manager.chats > 0 || manager.averageMinutes !== null || manager.text.length > 0),
    };
  });

  return shiftDays
    .filter((day) => day.managers.length > 0)
    .sort((first, second) => second.dayKey.localeCompare(first.dayKey));
}
