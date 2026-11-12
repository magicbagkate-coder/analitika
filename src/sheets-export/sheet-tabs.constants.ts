/** Tabs of the first spreadsheet version (2026-11-11), replaced by one tab per shift — removed on export. */
export const RETIRED_TABS = ['Смены', 'Оценки менеджеров', 'Скорость ответа', 'Графики'];

export const TABLE_HEADER = ['Кто', 'Роль', 'Показатель'];
export const SHIFT_GROUP_LABEL = 'Вся смена';
export const SHIFT_METRICS = ['Проблемы смены', 'Чатов', 'Средняя оценка', 'Скорость ответа, мин'];
export const MANAGER_METRICS = ['Чатов', 'Средняя оценка', 'Скорость ответа, мин', 'Разбор'];

/** Pixel widths: who, role, metric, then every day column. */
export const FIXED_COLUMN_WIDTHS = [190, 150, 180];
export const DAY_COLUMN_WIDTH = 330;

export const SHIFT_TOTALS_DATA_TITLE = 'Оценка и скорость всей смены';
export const SHIFT_SCORE_TITLE = 'Оценка смены';
export const SHIFT_SPEED_TITLE = 'Скорость смены, мин';
export const DAY_TITLE = 'Дата';

export const SHIFT_SCORE_CHART_TITLE = 'Средняя оценка смены по дням';
export const MANAGER_SCORE_CHART_TITLE = 'Средняя оценка менеджеров по дням';
export const MANAGER_SPEED_CHART_TITLE = 'Скорость ответа менеджеров, минут';

// Owner's request (2026-11-12): charts four times the first size (twice as wide and twice as tall),
// one under another below the table.
export const CHART_WIDTH_PIXELS = 1040;
export const CHART_HEIGHT_PIXELS = 660;
export const CHART_GAP_PIXELS = 30;
export const CHART_COUNT = 3;
export const DEFAULT_ROW_HEIGHT = 21;
