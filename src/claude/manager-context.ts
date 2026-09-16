import { getCanonicalManagerName, getManagerRole } from '../evaluation/manager-roles.constants';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

/**
 * Real manager names from message data, oldest to newest, resolved to their canonical name —
 * assignedManagerId doesn't reliably resolve to a name, and Sitniks records the same real person
 * under different literal strings (short name vs. full name) depending on context, so a raw
 * dedupe alone would still show one person as two (see manager-roles.constants.ts).
 */
export function collectManagerNames(messages: ChatMessage[]): string[] {
  const names = messages
    .map((message) => message.managerName)
    .filter((name): name is string => Boolean(name))
    .map((name) => getCanonicalManagerName(name));
  return Array.from(new Set(names));
}

/** One line per manager with their role, so Claude never judges a manager against a role that isn't theirs. */
export function describeManagerRoles(managerNames: string[]): string {
  if (managerNames.length === 0) return 'В диалоге пока нет ответов менеджера.';

  const lines = managerNames.map((name) => `${name} — ${getManagerRole(name) ?? 'роль неизвестна'}`);
  return `В диалоге участвовали: ${lines.join('; ')}.`;
}

/** Compact "Имя, роль / Имя, роль" form for a batch-synthesis data row — see claude-synthesis/claude-success services. */
export function describeManagersInline(managerNames: string[]): string {
  return managerNames.map((name) => `${name}, ${getManagerRole(name) ?? 'роль неизвестна'}`).join(' / ');
}
