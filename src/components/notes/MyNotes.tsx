"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, PenLine, Trash2 } from "lucide-react";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";

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

function notesError(message: string): string {
  if (/note_subjects|study_notes|schema cache|does not exist/i.test(message)) {
    return "My Notes is not installed on the database yet. Apply supabase/migrations/20261021000003_my_notes.sql, then reload.";
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
    const response = await fetch("/api/notes");
    const json = (await response.json()) as {
      subjects?: NoteSubject[];
      notes?: StudyNote[];
      error?: string;
    };
    if (!response.ok) {
      setError(notesError(json.error ?? "My Notes could not be opened."));
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
    // Load the signed-in student's subjects once when the shelf opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div className="min-h-screen bg-zinc-950 text-amber-100">
      <header className="sticky top-0 z-30 px-4 pt-5 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-amber-500/30 bg-zinc-950/80 px-5 py-2.5 backdrop-blur-xl">
          <OryzenLearnBrand subtitle="My Notes" />
          <Link href="/hub" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-amber-200">
            <ArrowLeft className="h-4 w-4" />
            Study hub
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-10 md:px-8">
        <p className="text-xs font-medium uppercase tracking-widest text-amber-200">Reference shelf</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white">My Notes</h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-amber-100">
          Keep each subject on the left. Open it whenever you need the notes you wrote for that subject.
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-black px-4 py-3 text-sm text-amber-100">
            {error}
          </p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-12">
          <section className="rounded-3xl border border-amber-500/30 bg-amber-950/20 p-5 lg:col-span-4">
            <h2 className="text-lg font-semibold text-white">Subjects</h2>
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
                className="min-h-[48px] flex-1 rounded-2xl border border-amber-500/30 bg-black px-4 text-sm text-amber-50 placeholder:text-amber-200/40"
              />
              <button
                type="submit"
                className="min-h-[48px] rounded-2xl border border-amber-500/40 bg-amber-950/50 px-4 text-sm font-medium text-amber-50 hover:bg-amber-950/70"
              >
                Add
              </button>
            </form>
            <div className="mt-4 space-y-2">
              {loading && <p className="text-sm text-amber-200">Loading subjects...</p>}
              {!loading && subjects.length === 0 && (
                <p className="text-sm text-amber-200">Add a subject to start a place for its notes.</p>
              )}
              {subjects.map((subject) => (
                <div key={subject.id} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => selectSubject(subject.id)}
                    className={`min-h-[48px] flex-1 rounded-2xl border px-4 text-left text-sm ${
                      subject.id === selectedId
                        ? "border-amber-200/50 bg-amber-950/60 text-amber-50"
                        : "border-amber-500/20 bg-zinc-950 text-amber-100 hover:border-amber-500/40"
                    }`}
                  >
                    {subject.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${subject.title}`}
                    onClick={() => void removeSubject(subject.id)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-500/20 text-amber-200 hover:bg-black"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-amber-500/30 bg-zinc-950 p-5 lg:col-span-8">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-amber-200" />
              <h2 className="text-lg font-semibold text-white">
                {selected ? selected.title : "Notes"}
              </h2>
            </div>
            {!selected && (
              <p className="mt-4 text-sm leading-relaxed text-amber-200">
                Choose a subject to write a note or read the ones already saved there.
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
                    className="min-h-[48px] w-full rounded-2xl border border-amber-500/30 bg-black px-4 text-sm text-amber-50 placeholder:text-amber-200/40"
                  />
                  <textarea
                    value={noteBody}
                    onChange={(event) => setNoteBody(event.target.value)}
                    placeholder="Write the note you want to come back to."
                    aria-label="Note"
                    rows={5}
                    className="w-full rounded-2xl border border-amber-500/30 bg-black px-4 py-3 text-sm leading-relaxed text-amber-50 placeholder:text-amber-200/40"
                  />
                  <button
                    type="submit"
                    className="min-h-[48px] rounded-2xl border border-amber-500/40 bg-amber-950/50 px-5 text-sm font-medium text-amber-50 hover:bg-amber-950/70"
                  >
                    Save note
                  </button>
                </form>

                <div className="mt-6 space-y-3">
                  {visibleNotes.length === 0 && (
                    <p className="text-sm text-amber-200">No notes in this subject yet.</p>
                  )}
                  {visibleNotes.map((note) => {
                    const open = openNoteId === note.id;
                    return (
                      <article
                        key={note.id}
                        className="rounded-2xl border border-amber-500/20 bg-amber-950/20 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => setOpenNoteId(open ? null : note.id)}
                            className="text-left"
                          >
                            <h3 className="text-base font-semibold text-white">{note.title}</h3>
                            <p className="mt-1 text-xs text-amber-200">
                              {open ? "Hide note" : "Read note"}
                            </p>
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${note.title}`}
                            onClick={() => void removeNote(note.id)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-amber-200 hover:bg-black"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {open && (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-amber-50">
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
    </div>
  );
}
