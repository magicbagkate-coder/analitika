export type ShiftMember = { managerName: string; roleLabel: string };

export type ShiftRoster = {
  shiftKey: string;
  tabTitle: string;
  /** "YYYY-MM-DD" (Kyiv) of the shift's first day — earlier days are left out of its tab; omitted for no limit. */
  firstDayKey?: string;
  members: ShiftMember[];
};

/**
 * Who works in which shift — the owner's schedule of 2026-11-12. Names are canonical CRM names
 * (see getCanonicalManagerName). Update when the schedule changes; managers outside this list
 * (service manager, people who left) have no shift tab.
 */
export const SHIFT_ROSTERS: ShiftRoster[] = [
  {
    shiftKey: 'shift-1',
    tabTitle: 'Смена 1 — Оля',
    members: [
      { managerName: 'Бурнацева Ольга', roleLabel: 'Старшая смены' },
      { managerName: 'Віолетта Бабак', roleLabel: 'Старший менеджер' },
      { managerName: 'Ольга Кошельнюк', roleLabel: 'Касания' },
      { managerName: 'Катерина Багель', roleLabel: 'Младший менеджер' },
    ],
  },
  {
    shiftKey: 'shift-2',
    tabTitle: 'Смена 2 — Наташа',
    members: [
      { managerName: 'Попович Наталія', roleLabel: 'Старшая смены' },
      { managerName: 'Офіленко Євгенія', roleLabel: 'Старший менеджер' },
      { managerName: 'Марія Лисенко', roleLabel: 'Младший менеджер' },
      { managerName: 'Анастасія Корєшкова', roleLabel: 'Касания' },
    ],
  },
  {
    shiftKey: 'shift-3',
    tabTitle: 'Смена 3 — Алина',
    // A new shift (owner, 2026-11-12): its history starts with its first day, 11.11.
    firstDayKey: '2026-11-11',
    members: [
      { managerName: 'Никольчева Аліна', roleLabel: 'Старшая смены' },
      { managerName: 'Ганна Кірієнко', roleLabel: 'Старший менеджер' },
      { managerName: 'Інесса Поліщук', roleLabel: 'Младший менеджер' },
      { managerName: 'Ілона Бабанова', roleLabel: 'Касания' },
    ],
  },
];

/** The shift a canonical manager name belongs to, or undefined for managers outside the shifts. */
export function findShiftOfManager(managerName: string): ShiftRoster | undefined {
  return SHIFT_ROSTERS.find((shift) => shift.members.some((member) => member.managerName === managerName));
}
