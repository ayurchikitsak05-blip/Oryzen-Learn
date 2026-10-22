import { buildOverflowWarning, dayByDate, workSessions } from "./engine";
import { overlapsSleep } from "./time";
import type { RoadmapRecord, RoadmapSession, TimetableEditResult } from "./types";

function cloneRecord(record: RoadmapRecord): RoadmapRecord {
  return structuredClone(record);
}

function findSession(
  record: RoadmapRecord,
  sessionId: string
): { dayIndex: number; sessionIndex: number; session: RoadmapSession } | null {
  for (let dayIndex = 0; dayIndex < record.plan.days.length; dayIndex += 1) {
    const day = record.plan.days[dayIndex];
    const sessionIndex = day.sessions.findIndex((session) => session.id === sessionId);
    if (sessionIndex >= 0) {
      return { dayIndex, sessionIndex, session: day.sessions[sessionIndex] };
    }
  }
  return null;
}

function refreshViews(record: RoadmapRecord): RoadmapRecord {
  const days = record.plan.days;
  const needed = workSessions(days.flatMap((day) => day.sessions)).reduce(
    (sum, session) => sum + session.minutes,
    0
  );
  const available = days.reduce((sum, day) => sum + day.availableStudyMinutes, 0);
  record.plan.overflow = buildOverflowWarning({
    neededStudyMinutes: record.plan.overflow.neededStudyMinutes || needed,
    availableStudyMinutes: available,
    unscheduled: record.plan.overflow.unscheduledChapters,
  });
  return record;
}

function sleepWarning(session: RoadmapSession, record: RoadmapRecord): string | null {
  if (overlapsSleep(session.startMinutes, session.endMinutes, record.intake.sleepWindow)) {
    return "That time sits in your sleep window. Study sessions stay outside sleep.";
  }
  return null;
}

export function moveSession(
  record: RoadmapRecord,
  sessionId: string,
  toDate: string,
  toStartMinutes: number
): TimetableEditResult {
  const next = cloneRecord(record);
  const found = findSession(next, sessionId);
  if (!found) return { record, warning: "That session is no longer on the timetable." };

  const targetDay = dayByDate(next.plan, toDate);
  if (!targetDay) {
    return { record, warning: "That date is outside this exam plan." };
  }

  const moved: RoadmapSession = {
    ...found.session,
    date: toDate,
    startMinutes: toStartMinutes,
    endMinutes: toStartMinutes + found.session.minutes,
  };
  const warning = sleepWarning(moved, next);
  if (warning) return { record, warning };

  next.plan.days[found.dayIndex].sessions.splice(found.sessionIndex, 1);
  targetDay.sessions.push(moved);
  targetDay.sessions.sort((a, b) => a.startMinutes - b.startMinutes);
  return { record: refreshViews(next), warning: null };
}

export function rescheduleSession(
  record: RoadmapRecord,
  sessionId: string,
  toDate: string
): TimetableEditResult {
  const found = findSession(record, sessionId);
  if (!found) return { record, warning: "That session is no longer on the timetable." };
  return moveSession(record, sessionId, toDate, found.session.startMinutes);
}

export function adjustSession(
  record: RoadmapRecord,
  sessionId: string,
  minutes: number
): TimetableEditResult {
  const next = cloneRecord(record);
  const found = findSession(next, sessionId);
  if (!found) return { record, warning: "That session is no longer on the timetable." };
  const duration = Math.max(10, Math.round(minutes));
  const updated: RoadmapSession = {
    ...found.session,
    minutes: duration,
    endMinutes: found.session.startMinutes + duration,
  };
  const warning = sleepWarning(updated, next);
  if (warning) return { record, warning };
  next.plan.days[found.dayIndex].sessions[found.sessionIndex] = updated;
  return { record: refreshViews(next), warning: null };
}

export function setSessionStart(
  record: RoadmapRecord,
  sessionId: string,
  startMinutes: number
): TimetableEditResult {
  const found = findSession(record, sessionId);
  if (!found) return { record, warning: "That session is no longer on the timetable." };
  return moveSession(record, sessionId, found.session.date, startMinutes);
}
