import type { ClockWindow, Weekday } from "./types";

export const MINUTES_PER_DAY = 24 * 60;

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function localIsoDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return { year, month, day };
}

export function weekday(iso: string): Weekday {
  const { year, month, day } = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() as Weekday;
}

export function addDays(iso: string, days: number): string {
  const { year, month, day } = parseIsoDate(iso);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(
    next.getUTCDate()
  ).padStart(2, "0")}`;
}

export function daysBetween(start: string, end: string): number {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  const startUtc = Date.UTC(a.year, a.month - 1, a.day);
  const endUtc = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function enumerateDates(start: string, endExclusive: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor < endExclusive && guard < 800) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

export function startOfIsoWeek(iso: string): string {
  const day = weekday(iso);
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(iso, mondayOffset);
}

export function yearMonth(iso: string): string {
  return iso.slice(0, 7);
}

export function clampMinutes(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function formatClock(minutes: number): string {
  const wrapped = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const hours = Math.floor(wrapped / 60);
  const mins = wrapped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatHours(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} min`;
  const hours = Math.floor(rounded / 60);
  const rem = rounded % 60;
  if (rem === 0) return `${hours}h`;
  return `${hours}h ${rem}m`;
}

export interface MinuteInterval {
  start: number;
  end: number;
}

export function normalizeWindow(window: ClockWindow): ClockWindow {
  return {
    startMinutes: clampMinutes(window.startMinutes, 0, MINUTES_PER_DAY - 1),
    endMinutes: clampMinutes(window.endMinutes, 0, MINUTES_PER_DAY),
  };
}

export function windowToIntervals(window: ClockWindow): MinuteInterval[] {
  const start = clampMinutes(window.startMinutes, 0, MINUTES_PER_DAY);
  const end = clampMinutes(window.endMinutes, 0, MINUTES_PER_DAY);
  if (start === end) return [{ start: 0, end: MINUTES_PER_DAY }];
  if (start < end) return [{ start, end }];
  return [
    { start, end: MINUTES_PER_DAY },
    { start: 0, end },
  ];
}

export function subtractIntervals(
  source: MinuteInterval[],
  blocked: MinuteInterval[]
): MinuteInterval[] {
  let current = source
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start);
  for (const block of blocked) {
    if (block.end <= block.start) continue;
    const next: MinuteInterval[] = [];
    for (const interval of current) {
      if (block.end <= interval.start || block.start >= interval.end) {
        next.push(interval);
        continue;
      }
      if (interval.start < block.start) {
        next.push({ start: interval.start, end: Math.min(interval.end, block.start) });
      }
      if (interval.end > block.end) {
        next.push({ start: Math.max(interval.start, block.end), end: interval.end });
      }
    }
    current = next.filter((interval) => interval.end - interval.start > 0);
  }
  return current;
}

export function intervalMinutes(intervals: MinuteInterval[]): number {
  return intervals.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0);
}

export function overlapsSleep(
  startMinutes: number,
  endMinutes: number,
  sleepWindow: ClockWindow
): boolean {
  const sleep = windowToIntervals(normalizeWindow(sleepWindow));
  return sleep.some(
    (interval) => startMinutes < interval.end && endMinutes > interval.start
  );
}

export function formatWeekday(iso: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][weekday(iso)] ?? "";
}

export function formatDisplayDate(iso: string): string {
  const { year, month, day } = parseIsoDate(iso);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
