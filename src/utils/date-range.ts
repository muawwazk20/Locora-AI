// Pure date helpers for the Discover calendar range picker. No
// dependencies, no timezone tricks: everything is a local calendar date
// (YYYY-MM-DD), matching how the existing preset filters compare an
// event's day in the viewer's timezone.

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Local YMD of an event's start (same "viewer day" the preset filters
// use: getFullYear/getMonth/getDate, not UTC getters).
export function eventDay(startDate: string): string {
  return toISODate(new Date(startDate));
}

export function isInRange(day: string, start: string, end: string): boolean {
  return day >= start && day <= end;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

// One cell of the calendar grid. Weeks start on Sunday.
export interface CalendarDay {
  // Local calendar date (YYYY-MM-DD).
  date: string;
  day: number;
  inMonth: boolean;
}

export function buildMonthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: CalendarDay[] = [];
  for (let i = 0; i < startWeekday; i++) {
    const day = daysInPrevMonth - startWeekday + 1 + i;
    const d = new Date(year, month - 1, day);
    cells.push({ date: toISODate(d), day, inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    cells.push({ date: toISODate(d), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const next = cells.length - startWeekday - daysInMonth + 1;
    const d = new Date(year, month + 1, next);
    cells.push({ date: toISODate(d), day: next, inMonth: false });
  }
  return cells;
}

function shortLabel(iso: string): { day: number; mon: string; year: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { day: d, mon: MONTH_SHORT[m - 1], year: y };
}

// Trigger label for a picked range. Same month: "9 – 14 Nov". Same year:
// "28 Oct – 3 Nov". Different years: "28 Dec 2026 – 3 Jan 2027". A
// single day: "9 Nov".
export function formatRangeLabel(start: string, end: string): string {
  const s = shortLabel(start);
  const e = shortLabel(end);
  if (start === end) return `${s.day} ${s.mon}`;
  if (s.year === e.year && s.mon === e.mon) return `${s.day} – ${e.day} ${s.mon}`;
  if (s.year === e.year) return `${s.day} ${s.mon} – ${e.day} ${e.mon}`;
  return `${s.day} ${s.mon} ${s.year} – ${e.day} ${e.mon} ${e.year}`;
}

// "November 2026" style label for a picked day, used in the popover.
export function formatDayLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = iso.split('-').map(Number);
  return { year: y, month: m - 1 };
}
