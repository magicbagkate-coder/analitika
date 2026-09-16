export type ManagerRole = 'молодший менеджер' | 'старший менеджер' | 'керівник зміни' | 'касатель' | 'сервіс менеджер';

/**
 * Who's who across the three shifts, as given by the owner on 2026-09-10 (roster) and confirmed
 * 2026-09-16 (canonical-name merges below). Update this list whenever shift rosters change —
 * Sitniks has no "role" field. Keyed by CANONICAL name only — see `getCanonicalManagerName` below
 * for the short-name/full-name aliases that must be resolved to these before lookup.
 */
const MANAGER_ROLE_BY_NAME = new Map<string, ManagerRole>([
  ['Попович Наталія', 'керівник зміни'],
  ['Офіленко Євгенія', 'молодший менеджер'],
  ['Анастасія Корєшкова', 'касатель'],
  ['Никольчева Аліна', 'старший менеджер'],
  ['Ольга Шульц', 'керівник зміни'],
  ['Ганна Кірієнко', 'старший менеджер'],
  ['Эля Григорян', 'молодший менеджер'],
  ['Ілона Бабанова', 'касатель'],
  ['Карина Ковальчук', 'молодший менеджер'],
  ['Бурнацева Ольга', 'керівник зміни'],
  ['Бурова Єва', 'молодший менеджер'],
  ['Ольга Кошельнюк', 'касатель'],
  ['Віолетта Бабак', 'старший менеджер'],
  ['Аліна Хоніч', 'сервіс менеджер'],
]);

/**
 * Sitniks records the same real person under different literal strings depending on which
 * shift/context sent the message (a short first name vs. the full name) — e.g. "Віолетта" and
 * "Віолетта Бабак" are the SAME senior manager, not two people. Found 2026-09-16: adding the full
 * name to MANAGER_ROLE_BY_NAME alone (so role lookup worked for both strings) was NOT enough —
 * every place that GROUPS chats/history by managerName (manager-characteristics, status-report
 * summaries, weekly trends, ...) still treated the two strings as different managers, producing
 * duplicate entries for one real person. Resolve to the canonical name FIRST, before any grouping
 * or role lookup, everywhere a raw `managerName` is used as a grouping key.
 */
const CANONICAL_NAME_BY_ALIAS = new Map<string, string>([
  ['Ольга', 'Ольга Шульц'],
  ['Ганна', 'Ганна Кірієнко'],
  ['Эля', 'Эля Григорян'],
  ['Віолетта', 'Віолетта Бабак'],
  ['Аліна', 'Аліна Хоніч'],
]);

/** Resolves a short-name alias to its canonical full name; names with no known alias pass through unchanged. */
export function getCanonicalManagerName(managerName: string): string {
  return CANONICAL_NAME_BY_ALIAS.get(managerName) ?? managerName;
}

export function getManagerRole(managerName: string): ManagerRole | undefined {
  return MANAGER_ROLE_BY_NAME.get(getCanonicalManagerName(managerName));
}
