import { escapeHtml } from '../telegram/telegram-format';
import type { ManagerCharacteristic } from '../claude/claude-manager-summary.service';

/** Telegram HTML parse_mode, same emoji + bold style as the rest of the run — sent as its own message, worst score first. */
export function formatManagerCharacteristics(characteristics: ManagerCharacteristic[]): string {
  if (characteristics.length === 0) return '';

  const sorted = [...characteristics].sort((a, b) => a.score - b.score);
  const blocks = sorted.map((characteristic) => formatOneManager(characteristic));

  return ['👤<b>Характеристика менеджеров (этот прогон, оба статуса):</b>', ...blocks].join('\n\n');
}

function formatOneManager(characteristic: ManagerCharacteristic): string {
  const header = `<b>${escapeHtml(characteristic.managerName)}</b> — ${characteristic.score}/5`;
  if (characteristic.recurringIssues.length === 0) return header;

  const issueLines = characteristic.recurringIssues.map((issue) => `• ${escapeHtml(issue)}`);
  return [header, ...issueLines].join('\n');
}
