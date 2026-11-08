/**
 * Voice notes for revision (owner list A, 8 Nov 2026). Recorded with the phone's microphone
 * and kept only on this device (IndexedDB), so they cost nothing to store. No AI.
 */

export const VOICE_DB = "oryzen-voice-notes";
export const VOICE_STORE = "notes";
export const MAX_RECORD_SECONDS = 120;
export const VOICE_NOTES_EVENT = "oryzen-voice-notes-changed";

export interface VoiceNote {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  seconds: number;
  type: string;
  blob: Blob;
}

export type VoiceNoteMeta = Omit<VoiceNote, "blob">;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("no_indexeddb"));
      return;
    }
    const request = indexedDB.open(VOICE_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VOICE_STORE)) {
        db.createObjectStore(VOICE_STORE, { keyPath: "id" }).createIndex("userId", "userId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function voiceNotesSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof indexedDB !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

export function cleanVoiceTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim().slice(0, 120) || "Voice note";
}

export async function saveVoiceNote(note: Omit<VoiceNote, "id" | "createdAt"> & { id?: string }): Promise<VoiceNoteMeta> {
  const db = await openDb();
  const record: VoiceNote = {
    ...note,
    id: note.id ?? `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title: cleanVoiceTitle(note.title),
    createdAt: new Date().toISOString(),
    seconds: Math.max(0, Math.round(note.seconds)),
  };
  await done(db.transaction(VOICE_STORE, "readwrite").objectStore(VOICE_STORE).put(record));
  window.dispatchEvent(new Event(VOICE_NOTES_EVENT));
  const { blob: _blob, ...meta } = record;
  void _blob;
  return meta;
}

/** This student's voice notes, newest first (without the audio, for lists). */
export async function listVoiceNotes(userId: string): Promise<VoiceNoteMeta[]> {
  try {
    const db = await openDb();
    const rows = (await done(
      db.transaction(VOICE_STORE).objectStore(VOICE_STORE).index("userId").getAll(userId)
    )) as VoiceNote[];
    return rows
      .map(({ blob: _blob, ...meta }) => {
        void _blob;
        return meta;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function voiceNoteAudio(id: string, userId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const row = (await done(db.transaction(VOICE_STORE).objectStore(VOICE_STORE).get(id))) as VoiceNote | undefined;
    return row && row.userId === userId ? row.blob : null;
  } catch {
    return null;
  }
}

export async function deleteVoiceNote(id: string, userId: string): Promise<void> {
  const db = await openDb();
  const store = db.transaction(VOICE_STORE, "readwrite").objectStore(VOICE_STORE);
  const row = (await done(store.get(id))) as VoiceNote | undefined;
  if (row && row.userId === userId) {
    await done(db.transaction(VOICE_STORE, "readwrite").objectStore(VOICE_STORE).delete(id));
  }
  window.dispatchEvent(new Event(VOICE_NOTES_EVENT));
}

/** The best recording format this browser supports (iPhones record mp4/aac, others webm). */
export function pickAudioType(isSupported: (type: string) => boolean): string {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]) {
    if (isSupported(type)) return type;
  }
  return "";
}
