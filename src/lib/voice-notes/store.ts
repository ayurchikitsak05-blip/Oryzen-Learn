import { openBytes, privateAccessAllowed, sealBytes } from "@/lib/privacy/account-vault";

/**
 * Voice notes for revision (owner list A, 8 Nov 2026). Recorded with the phone's microphone
 * and kept only on this device (IndexedDB), so they cost nothing to store. No AI.
 * The title and audio are locked with the student's private key, like the rest of their record.
 */

export const VOICE_DB = "oryzen-voice-notes";
export const VOICE_STORE = "notes";
export const MAX_RECORD_SECONDS = 120;
export const VOICE_NOTES_EVENT = "oryzen-voice-notes-changed";

export interface VoiceNoteMeta {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  seconds: number;
  type: string;
}

/** What is kept on the phone: the title and the audio are locked with the student's private key. */
interface StoredVoiceNote {
  id: string;
  userId: string;
  createdAt: string;
  seconds: number;
  type: string;
  title: { iv: string; data: string };
  audio: { iv: string; data: string };
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

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

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("aborted"));
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

/** Saves a recording, locked with the student's private key. Throws "locked" if the key isn't open. */
export async function saveVoiceNote(note: {
  userId: string;
  title: string;
  seconds: number;
  type: string;
  blob: Blob;
  id?: string;
}): Promise<VoiceNoteMeta> {
  if (!privateAccessAllowed(note.userId)) throw new Error("locked");
  const title = cleanVoiceTitle(note.title);
  const sealedTitle = await sealBytes(encoder.encode(title));
  const sealedAudio = await sealBytes(new Uint8Array(await note.blob.arrayBuffer()));
  if (!sealedTitle || !sealedAudio) throw new Error("locked");
  const record: StoredVoiceNote = {
    id: note.id ?? `voice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: note.userId,
    createdAt: new Date().toISOString(),
    seconds: Math.max(0, Math.round(note.seconds)),
    type: note.type,
    title: sealedTitle,
    audio: sealedAudio,
  };
  const db = await openDb();
  const tx = db.transaction(VOICE_STORE, "readwrite");
  tx.objectStore(VOICE_STORE).put(record);
  await committed(tx);
  window.dispatchEvent(new Event(VOICE_NOTES_EVENT));
  return { id: record.id, userId: record.userId, title, createdAt: record.createdAt, seconds: record.seconds, type: record.type };
}

/** This student's voice notes, newest first (titles only). Empty while the private key is closed. */
export async function listVoiceNotes(userId: string): Promise<VoiceNoteMeta[]> {
  if (!privateAccessAllowed(userId)) return [];
  try {
    const db = await openDb();
    const rows = (await done(
      db.transaction(VOICE_STORE).objectStore(VOICE_STORE).index("userId").getAll(userId)
    )) as StoredVoiceNote[];
    const notes: VoiceNoteMeta[] = [];
    for (const row of rows) {
      if (!row.title?.iv) continue;
      const plain = await openBytes(row.title.iv, row.title.data);
      if (!plain) continue;
      notes.push({
        id: row.id,
        userId: row.userId,
        title: decoder.decode(plain),
        createdAt: row.createdAt,
        seconds: row.seconds,
        type: row.type,
      });
    }
    return notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function voiceNoteAudio(id: string, userId: string): Promise<Blob | null> {
  if (!privateAccessAllowed(userId)) return null;
  try {
    const db = await openDb();
    const row = (await done(db.transaction(VOICE_STORE).objectStore(VOICE_STORE).get(id))) as
      | StoredVoiceNote
      | undefined;
    if (!row || row.userId !== userId || !row.audio?.iv) return null;
    const plain = await openBytes(row.audio.iv, row.audio.data);
    return plain ? new Blob([plain as BlobPart], { type: row.type || "audio/webm" }) : null;
  } catch {
    return null;
  }
}

/** Deletes one of this student's voice notes. Returns false if it couldn't be deleted. */
export async function deleteVoiceNote(id: string, userId: string): Promise<boolean> {
  try {
    const db = await openDb();
    const tx = db.transaction(VOICE_STORE, "readwrite");
    const store = tx.objectStore(VOICE_STORE);
    const row = (await done(store.get(id))) as StoredVoiceNote | undefined;
    if (row && row.userId === userId) store.delete(id);
    await committed(tx);
    window.dispatchEvent(new Event(VOICE_NOTES_EVENT));
    return true;
  } catch {
    return false;
  }
}

/** The best recording format this browser supports (iPhones record mp4/aac, others webm). */
export function pickAudioType(isSupported: (type: string) => boolean): string {
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac"]) {
    if (isSupported(type)) return type;
  }
  return "";
}
