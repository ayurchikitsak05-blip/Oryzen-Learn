import {
  accountVaultUserId,
  ensureAccountVault,
  isAccountVaultUnlocked,
  readPrivateString,
  writePrivateString,
} from "@/lib/privacy/account-vault";
import type { TimestampedLectureNote } from "@/lib/video/sync-engine";

const STORAGE_KEY = "oryzen_video_caption_notes_v1";
const MAX_LECTURES = 8;

export type StoredCaptionLecture = {
  videoId: string;
  url: string;
  title: string;
  notes: TimestampedLectureNote[];
};

type StoredCaptionRecord = {
  version: 1;
  ownerId: string;
  lectures: StoredCaptionLecture[];
};

function parseRecord(raw: string | null): StoredCaptionRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCaptionRecord;
    if (parsed?.version !== 1 || !parsed.ownerId || !Array.isArray(parsed.lectures)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function visibleLectures(record: StoredCaptionRecord | null, ownerId: string): StoredCaptionLecture[] {
  if (!record || record.ownerId !== ownerId) return [];
  return record.lectures.filter((item) => item.videoId && item.notes?.length);
}

function clearMatchingPlaintext(ownerId: string): void {
  if (typeof localStorage === "undefined") return;
  const plain = parseRecord(localStorage.getItem(STORAGE_KEY));
  if (plain?.ownerId === ownerId) localStorage.removeItem(STORAGE_KEY);
}

export function readVideoCaptionNotes(ownerId: string): StoredCaptionLecture[] {
  if (!ownerId) return [];
  const sealed = visibleLectures(parseRecord(readPrivateString(STORAGE_KEY, ownerId)), ownerId);
  if (sealed.length > 0) {
    clearMatchingPlaintext(ownerId);
    return sealed;
  }
  if (typeof localStorage === "undefined") return [];
  const plain = parseRecord(localStorage.getItem(STORAGE_KEY));
  const lectures = visibleLectures(plain, ownerId);
  if (lectures.length === 0) return [];
  if (isAccountVaultUnlocked() && accountVaultUserId() === ownerId) {
    writePrivateString(STORAGE_KEY, JSON.stringify(plain), ownerId);
    clearMatchingPlaintext(ownerId);
  }
  return lectures;
}

/**
 * Reads the saved lectures after the account's private storage has opened. Reading straight
 * after sign-in found nothing for a few seconds after a reload (manual test, 17 Nov 2026).
 */
export async function loadVideoCaptionNotes(ownerId: string): Promise<StoredCaptionLecture[]> {
  if (!ownerId) return [];
  if (!isAccountVaultUnlocked() || accountVaultUserId() !== ownerId) {
    const opened = await ensureAccountVault().catch(() => false);
    if (!opened || accountVaultUserId() !== ownerId) return [];
  }
  return readVideoCaptionNotes(ownerId);
}

export async function writeVideoCaptionNotes(
  ownerId: string,
  lecture: StoredCaptionLecture
): Promise<boolean> {
  // An empty list removes the lecture's saved topics (e.g. the student removed the last one).
  if (!ownerId || !lecture.videoId) return false;
  if (!isAccountVaultUnlocked() || accountVaultUserId() !== ownerId) {
    const opened = await ensureAccountVault();
    if (!opened || accountVaultUserId() !== ownerId) return false;
  }
  const lectures = [
    ...readVideoCaptionNotes(ownerId).filter((item) => item.videoId !== lecture.videoId),
    ...(lecture.notes.length > 0 ? [lecture] : []),
  ].slice(-MAX_LECTURES);
  const record: StoredCaptionRecord = { version: 1, ownerId, lectures };
  writePrivateString(STORAGE_KEY, JSON.stringify(record), ownerId);
  clearMatchingPlaintext(ownerId);
  return true;
}
