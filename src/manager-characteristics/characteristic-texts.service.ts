import { Injectable, Logger } from '@nestjs/common';
import { ClaudeShiftProblemsService } from '../claude/claude-shift-problems.service';
import { getCanonicalManagerName } from '../evaluation/manager-roles.constants';
import { ReportTextsService } from '../report-texts/report-texts.service';
import { SHIFT_ROSTERS } from '../shifts/shift-roster.constants';
import type { ManagerCharacteristic } from '../claude/claude-manager-summary.service';
import type { ShiftFacts } from '../claude/claude-shift-problems.service';
import type { ReportTextRow } from '../report-texts/report-texts.types';

type RecordRunParams = { reportAt: Date; characteristics: ManagerCharacteristic[] };

const BULLET = '• ';
const NO_REMARKS_TEXT = 'Конкретных замечаний нет.';

function formatIssues(issues: string[]): string {
  return issues.length > 0 ? issues.map((issue) => `${BULLET}${issue}`).join('\n') : NO_REMARKS_TEXT;
}

/**
 * Keeps the text side of a report for the spreadsheet's shift tabs: each manager's characteristic
 * and, per shift, the problems shared by its managers. Never throws — the report is already out.
 */
@Injectable()
export class CharacteristicTextsService {
  private readonly logger = new Logger(CharacteristicTextsService.name);

  constructor(
    private readonly reportTextsService: ReportTextsService,
    private readonly claudeShiftProblemsService: ClaudeShiftProblemsService,
  ) {}

  async recordRun(params: RecordRunParams): Promise<void> {
    const characteristics = params.characteristics.map((item) => ({ ...item, managerName: getCanonicalManagerName(item.managerName) }));
    const managerRows: ReportTextRow[] = characteristics.map((item) => ({
      reportAt: params.reportAt,
      kind: 'manager',
      subject: item.managerName,
      text: formatIssues(item.recurringIssues),
    }));

    const shiftRows = await this.tryBuildShiftRows({ reportAt: params.reportAt, characteristics });
    await this.reportTextsService.tryRecordMany([...managerRows, ...shiftRows]);
  }

  private async tryBuildShiftRows(params: RecordRunParams): Promise<ReportTextRow[]> {
    const byName = new Map(params.characteristics.map((item) => [item.managerName, item]));
    const shifts: ShiftFacts[] = SHIFT_ROSTERS.map((shift) => ({
      shiftKey: shift.shiftKey,
      shiftTitle: shift.tabTitle,
      managers: shift.members
        .filter((member) => byName.has(member.managerName))
        .map((member) => ({ managerName: member.managerName, roleLabel: member.roleLabel, recurringIssues: byName.get(member.managerName)?.recurringIssues ?? [] })),
    }));

    try {
      const problems = await this.claudeShiftProblemsService.synthesizeShiftProblems(shifts);
      return problems
        .filter((shift) => shift.problems.length > 0)
        .map((shift) => ({ reportAt: params.reportAt, kind: 'shift', subject: shift.shiftKey, text: formatIssues(shift.problems) }));
    } catch (error) {
      this.logger.warn(`Could not synthesize shift problems: ${(error as Error).message}`);
      return [];
    }
  }
}
