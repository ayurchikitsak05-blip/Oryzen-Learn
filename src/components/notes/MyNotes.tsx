"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PenLine, Trash2 } from "lucide-react";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { useSignedInScope } from "@/components/coach/CoachHost";
import { listSprintNotes } from "@/lib/sprint";

interface NoteSubject {
  id: string;
  title: string;
  updated_at: string;
}

interface StudyNote {
  id: string;
  subject_id: string;
  title: string;
  body: string;
  updated_at: string;
}

function SprintSessionNotes() {
  const sprintId = useSearchParams().get("sprint");
  const userId = useSignedInScope();
  const [notes, setNotes] = useState<ReturnType<typeof listSprintNotes>>([]);
  useEffect(() => {
    setNotes(listSprintNotes(userId).filter((note) => !sprintId || note.sessionId === sprintId));
  }, [sprintId, userId]);
  if (notes.length === 0) return null;
  return (
    <section data-testid="notebook-sprint-notes" className={`${ui.card} mt-6`}>
      <h2 className={`${ui.heading} text-lg`}>From this StudySprint</h2>
      <ul className="mt-3 space-y-2">
        {notes.slice(0, 8).map((note) => (
          <li key={note.id} className="text-sm">
            <p className="font-medium text-heading">{note.title}</p>
            <p className="text-xs text-muted">{note.source}</p>
            <p className="mt-1 text-ink">{note.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function notesError(message: string): string {
  if (/note_subjects|study_notes|schema cache|does not exist/i.test(message)) {
    return "Your notebook isn't ready yet. Please try again in a moment.";
  }
  return message;
}

export default function MyNotes() {
  const [subjects, setSubjects] = useState<NoteSubject[]>([]);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [subjectTitle, setSubjectTitle] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadSubjects = async (preferId?: string | null) => {
    const response = await fetch("/api/notes", { credentials: "same-origin" });
    const json = (await response.json()) as {
      subjects?: NoteSubject[];
      notes?: StudyNote[];
      error?: string;
    };
    if (!response.ok) {
      setError(notesError(json.error ?? "Your notebook could not be opened."));
      setSubjects([]);
      setNotes([]);
      setLoading(false);
      return;
    }
    const rows = json.subjects ?? [];
    const savedNotes = json.notes ?? [];
    setSubjects(rows);
    setNotes(savedNotes);
    setError(null);
    setSelectedId((current) => {
      if (preferId && rows.some((row) => row.id === preferId)) return preferId;
      if (current && rows.some((row) => row.id === current)) return current;
      return rows[0]?.id ?? null;
    });
    setLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSubjects();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const selectSubject = (subjectId: string) => {
    setSelectedId(subjectId);
    setOpenNoteId(null);
    setError(null);
  };

  const createSubject = async () => {
    const title = subjectTitle.trim();
    if (!title) return;
    setError(null);
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_subject", title }),
    });
    const json = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !json.id) {
      setError(notesError(json.error ?? "The subject could not be created."));
      return;
    }
    setSubjectTitle("");
    await loadSubjects(json.id);
  };

  const createNote = async () => {
    const title = noteTitle.trim();
    if (!selectedId || !title) return;
    setError(null);
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_note",
        subjectId: selectedId,
        title,
        noteBody,
      }),
    });
    const json = (await response.json()) as { id?: string; error?: string };
    if (!response.ok || !json.id) {
      setError(notesError(json.error ?? "The note could not be saved."));
      return;
    }
    setNoteTitle("");
    setNoteBody("");
    setOpenNoteId(json.id);
    await loadSubjects(selectedId);
  };

  const removeSubject = async (subjectId: string) => {
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_subject", id: subjectId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(notesError(json.error ?? "The subject could not be removed."));
      return;
    }
    if (selectedId === subjectId) {
      setSelectedId(null);
      setOpenNoteId(null);
    }
    await loadSubjects(null);
  };

  const removeNote = async (noteId: string) => {
    const response = await fetch("/api/notes", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_note", id: noteId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(notesError(json.error ?? "The note could not be removed."));
      return;
    }
    if (openNoteId === noteId) setOpenNoteId(null);
    await loadSubjects(selectedId);
  };

  const selected = subjects.find((subject) => subject.id === selectedId) ?? null;
  const visibleNotes = notes.filter((note) => note.subject_id === selectedId);

  return (
    <AppChrome subtitle="My Notebook">
      <main className={ui.main}>
        <p className={ui.eyebrow}>My Notebook</p>
        <h1 className={`${ui.heading} mt-3 text-4xl`}>My Notebook</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
          Capture your thoughts, save important ideas, and return to them whenever you need.
        </p>
        <Suspense fallback={null}>
          <SprintSessionNotes />
        </Suspense>
        {error && <p className={`${ui.alert} mt-4`}>{error}</p>}

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <section className={`${ui.cardPad} lg:col-span-4`}>
            <h2 className={`${ui.heading} text-lg`}>Subjects</h2>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void createSubject();
              }}
            >
              <input
                value={subjectTitle}
                onChange={(event) => setSubjectTitle(event.target.value)}
                placeholder="Anatomy"
                aria-label="New subject"
                className={`${ui.input} flex-1`}
              />
              <button
                type="submit"
                className={ui.primary}
              >
                Add
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {loading && <p className={ui.loading}>Opening your notebook...</p>}
              {!loading && subjects.length === 0 && (
                <p className={ui.empty}>Your notebook is waiting for its first idea.</p>
              )}
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectSubject(subject.id)}
                    className={`min-h-12 flex-1 rounded-2xl border px-4 text-left text-sm ${
                      subject.id === selectedId ? ui.selected : ui.idle
                    }`}
                  >
                    {subject.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${subject.title}`}
                    onClick={() => void removeSubject(subject.id)}
                    className={`${ui.iconBtn} border border-line`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={`${ui.cardPad} lg:col-span-8`}>
            <div className="flex items-center gap-2">
              <span className={ui.chip}>
                <PenLine className="h-5 w-5" />
              </span>
              <h2 className={`${ui.heading} text-lg`}>
                {selected ? selected.title : "Notes"}
              </h2>
            </div>
            {!selected && (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Choose a subject to write in your notebook or open a note you already saved.
              </p>
            )}
            {selected && (
              <>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createNote();
                  }}
                >
                  <input
                    value={noteTitle}
                    onChange={(event) => setNoteTitle(event.target.value)}
                    placeholder="Note title"
                    aria-label="Note title"
                    className={ui.input}
                  />
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Write the note you want to come back to."
                    aria-label="Note"
                    rows={5}
                    className={ui.textarea}
                  />
                  <button
                    type="submit"
                    className={ui.primary}
                  >
                    Save note
                  </button>
                </form>

                <div className="mt-6 space-y-3">
                  {visibleNotes.length === 0 && (
                    <p className={ui.empty}>This subject is waiting for its first note.</p>
                  )}
                  {visibleNotes.map((note) => {
                    const open = openNoteId === note.id;
                    return (
                      <article
                        key={note.id}
                        className="rounded-2xl border border-line bg-beige-2 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setOpenNoteId(open ? null : note.id)}
                            className="text-left"
                          >
                            <h3 className="font-display text-base text-heading">{note.title}</h3>
                            <p className="mt-1 text-xs text-muted">
                              {open ? "Hide note" : "Read note"}
                            </p>
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${note.title}`}
                            onClick={() => void removeNote(note.id)}
                            className={ui.iconBtn}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {open && (
                          <p className="font-reading mt-3 whitespace-pre-wrap text-ink">
                            {note.body || "This note has no written body yet."}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </AppChrome>
  );
}
