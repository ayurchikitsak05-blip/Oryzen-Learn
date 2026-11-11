"use client";

import React, { useState } from "react";
import { ArrowDown, ChevronLeft, ChevronRight, Eye, EyeOff, Plus, X } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { NOTE_FORMATS, parseNote, type FormattedNote, type NoteFormat, type OutlineItem } from "@/lib/notes/formats";

const smallBtn =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-canvas text-muted hover:bg-beige-2";

/** Chips to choose a note's format. */
export function FormatPicker({ value, onChange }: { value: NoteFormat; onChange: (format: NoteFormat) => void }) {
  const current = NOTE_FORMATS.find((item) => item.id === value) ?? NOTE_FORMATS[0];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Note format">
        {NOTE_FORMATS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="radio"
            aria-checked={item.id === value}
            onClick={() => onChange(item.id)}
            className={`min-h-10 rounded-full border px-3 text-sm font-medium ${item.id === value ? ui.selected : ui.idle}`}
            data-testid={`format-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{current.hint}</p>
    </div>
  );
}

function ItemRows({
  items,
  onChange,
  placeholder,
}: {
  items: OutlineItem[];
  onChange: (items: OutlineItem[]) => void;
  placeholder: (level: number) => string;
}) {
  const update = (index: number, patch: Partial<OutlineItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-1" style={{ paddingLeft: `${item.level * 1.25}rem` }}>
          <button
            type="button"
            className={smallBtn}
            aria-label={`Move line ${index + 1} left`}
            disabled={item.level === 0}
            onClick={() => update(index, { level: Math.max(0, item.level - 1) as OutlineItem["level"] })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={smallBtn}
            aria-label={`Move line ${index + 1} right`}
            disabled={item.level === 2}
            onClick={() => update(index, { level: Math.min(2, item.level + 1) as OutlineItem["level"] })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
          <input
            className={`${ui.input} min-w-0 flex-1 ${item.level === 0 ? "font-semibold" : ""}`}
            value={item.text}
            placeholder={placeholder(item.level)}
            onChange={(event) => update(index, { text: event.target.value })}
            aria-label={`Line ${index + 1}, level ${item.level + 1}`}
          />
          <button type="button" className={smallBtn} aria-label={`Remove line ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className={ui.ghost}
        onClick={() => onChange([...items, { level: items[items.length - 1]?.level ?? 0, text: "" }])}
      >
        <Plus className="h-4 w-4" aria-hidden="true" /> Add line
      </button>
    </div>
  );
}

/** Edits a note in its chosen format. */
export function FormattedNoteEditor({ note, onChange }: { note: FormattedNote; onChange: (note: FormattedNote) => void }) {
  switch (note.format) {
    case "plain":
      return (
        <textarea
          value={note.text}
          onChange={(event) => onChange({ ...note, text: event.target.value })}
          placeholder="Write the note you want to come back to."
          aria-label="Note"
          rows={5}
          className={ui.textarea}
          data-testid="note-plain"
        />
      );
    case "cornell":
      return (
        <div className="space-y-2" data-testid="note-cornell-editor">
          {note.pairs.map((pair, index) => (
            <div key={index} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
              <input
                className={ui.input}
                value={pair.q}
                placeholder={index === 0 ? "Question, e.g. Causes?" : "Question"}
                aria-label={`Question ${index + 1}`}
                onChange={(event) =>
                  onChange({ ...note, pairs: note.pairs.map((p, i) => (i === index ? { ...p, q: event.target.value } : p)) })
                }
              />
              <textarea
                className={`${ui.input} min-h-11`}
                rows={2}
                value={pair.a}
                placeholder="Answer"
                aria-label={`Answer ${index + 1}`}
                onChange={(event) =>
                  onChange({ ...note, pairs: note.pairs.map((p, i) => (i === index ? { ...p, a: event.target.value } : p)) })
                }
              />
              <button
                type="button"
                className={smallBtn}
                aria-label={`Remove question ${index + 1}`}
                onClick={() => onChange({ ...note, pairs: note.pairs.filter((_, i) => i !== index) })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" className={ui.ghost} onClick={() => onChange({ ...note, pairs: [...note.pairs, { q: "", a: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add question
          </button>
          <textarea
            className={ui.textarea}
            rows={2}
            value={note.summary}
            placeholder="Summary in one or two lines"
            aria-label="Summary"
            onChange={(event) => onChange({ ...note, summary: event.target.value })}
          />
        </div>
      );
    case "outline":
      return (
        <ItemRows
          items={note.items}
          onChange={(items) => onChange({ ...note, items })}
          placeholder={(level) => (level === 0 ? "Heading" : level === 1 ? "Sub-heading or point" : "Detail")}
        />
      );
    case "mindmap":
      return (
        <div className="space-y-2">
          <p className="text-xs text-muted">The note title is the centre. Left-most lines are branches; move a line right to put it under a branch.</p>
          <ItemRows
            items={note.items}
            onChange={(items) => onChange({ ...note, items })}
            placeholder={(level) => (level === 0 ? "Branch, e.g. Causes" : "Detail")}
          />
        </div>
      );
    case "table": {
      const width = Math.max(1, ...note.rows.map((row) => row.length));
      const setCell = (r: number, c: number, value: string) =>
        onChange({
          ...note,
          rows: note.rows.map((row, ri) =>
            ri === r ? Array.from({ length: width }, (_, ci) => (ci === c ? value : row[ci] ?? "")) : row
          ),
        });
      return (
        <div className="space-y-2" data-testid="note-table-editor">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1">
              <tbody>
                {note.rows.map((row, r) => (
                  <tr key={r}>
                    {Array.from({ length: width }, (_, c) => (
                      <td key={c}>
                        <input
                          className={`${ui.input} !w-32 min-w-[7rem] ${r === 0 ? "font-semibold" : ""}`}
                          value={row[c] ?? ""}
                          placeholder={r === 0 ? (c === 0 ? "Compare" : `Item ${c}`) : c === 0 ? "Feature" : ""}
                          aria-label={`Row ${r + 1}, column ${c + 1}`}
                          onChange={(event) => setCell(r, c, event.target.value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.ghost} onClick={() => onChange({ ...note, rows: [...note.rows, Array(width).fill("")] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Row
            </button>
            <button
              type="button"
              className={ui.ghost}
              disabled={width >= 6}
              onClick={() => onChange({ ...note, rows: note.rows.map((row) => [...row, ""]) })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Column
            </button>
            <button
              type="button"
              className={ui.ghost}
              disabled={note.rows.length <= 2}
              onClick={() => onChange({ ...note, rows: note.rows.slice(0, -1) })}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Last row
            </button>
            <button
              type="button"
              className={ui.ghost}
              disabled={width <= 2}
              onClick={() => onChange({ ...note, rows: note.rows.map((row) => row.slice(0, width - 1)) })}
            >
              <X className="h-4 w-4" aria-hidden="true" /> Last column
            </button>
          </div>
        </div>
      );
    }
    case "flowchart":
      return (
        <div className="space-y-2" data-testid="note-flow-editor">
          {note.steps.map((step, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-sm font-semibold text-muted">{index + 1}.</span>
              <input
                className={`${ui.input} min-w-0 flex-1`}
                value={step}
                placeholder={index === 0 ? "First step" : "Then…"}
                aria-label={`Step ${index + 1}`}
                onChange={(event) => onChange({ ...note, steps: note.steps.map((s, i) => (i === index ? event.target.value : s)) })}
              />
              <button
                type="button"
                className={smallBtn}
                aria-label={`Remove step ${index + 1}`}
                onClick={() => onChange({ ...note, steps: note.steps.filter((_, i) => i !== index) })}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          <button type="button" className={ui.ghost} onClick={() => onChange({ ...note, steps: [...note.steps, ""] })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add step
          </button>
        </div>
      );
  }
}

/** Draws a saved note in its format. */
export function FormattedNoteView({ title, body }: { title: string; body: string }) {
  const note = parseNote(body);
  const [covered, setCovered] = useState(false);
  switch (note.format) {
    case "plain":
      return (
        <p className="font-reading whitespace-pre-wrap text-ink" data-testid="note-view-plain">
          {note.text || "This note has no written body yet."}
        </p>
      );
    case "cornell":
      return (
        <div className="space-y-2" data-testid="note-view-cornell">
          <button type="button" className={ui.ghost} onClick={() => setCovered(!covered)} data-testid="cornell-cover">
            {covered ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
            {covered ? "Show answers" : "Cover answers and test yourself"}
          </button>
          <div className="overflow-hidden rounded-xl border border-line">
            {note.pairs.map((pair, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,2fr)_minmax(0,5fr)] border-b border-line last:border-b-0">
                <div className="bg-beige-2 p-2 text-sm font-semibold text-heading">{pair.q}</div>
                <div className="p-2 text-sm text-ink">
                  {covered ? <span className="text-muted">Say it, then tap Show answers</span> : pair.a}
                </div>
              </div>
            ))}
          </div>
          {note.summary ? (
            <p className="rounded-xl bg-beige-2 p-2 text-sm text-ink">
              <span className="font-semibold text-heading">Summary: </span>
              {note.summary}
            </p>
          ) : null}
        </div>
      );
    case "outline":
      return (
        <ul className="space-y-1 text-sm text-ink" data-testid="note-view-outline">
          {note.items.map((item, index) => (
            <li
              key={index}
              style={{ paddingLeft: `${item.level * 1.25}rem` }}
              className={item.level === 0 ? "pt-1 font-semibold text-heading" : ""}
            >
              {item.level > 0 ? "• " : ""}
              {item.text}
            </li>
          ))}
        </ul>
      );
    case "mindmap": {
      const branches: { text: string; children: OutlineItem[] }[] = [];
      for (const item of note.items) {
        if (item.level === 0 || branches.length === 0) branches.push({ text: item.level === 0 ? item.text : "", children: item.level === 0 ? [] : [item] });
        else branches[branches.length - 1].children.push(item);
      }
      return (
        <div className="space-y-3" data-testid="note-view-mindmap">
          <p className="mx-auto w-fit rounded-full bg-accent px-4 py-2 text-center text-sm font-semibold text-canvas">{title}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {branches.map((branch, index) => (
              <div key={index} className="rounded-xl border-l-4 border-accent bg-surface p-2">
                {branch.text ? <p className="text-sm font-semibold text-heading">{branch.text}</p> : null}
                {branch.children.length ? (
                  <ul className="mt-1 space-y-0.5 text-sm text-ink">
                    {branch.children.map((child, ci) => (
                      <li key={ci} style={{ paddingLeft: `${(child.level - 1) * 0.75}rem` }}>
                        – {child.text}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "table": {
      const [head = [], ...rows] = note.rows;
      return (
        <div className="overflow-x-auto" data-testid="note-view-table">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr>
                {head.map((value, index) => (
                  <th key={index} scope="col" className="border border-line bg-beige-2 px-2 py-1 font-semibold text-heading">
                    {value}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {head.map((_, c) =>
                    c === 0 ? (
                      <th key={c} scope="row" className="border border-line px-2 py-1 align-top font-semibold text-heading">
                        {row[c] ?? ""}
                      </th>
                    ) : (
                      <td key={c} className="border border-line px-2 py-1 align-top text-ink">
                        {row[c] ?? ""}
                      </td>
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "flowchart":
      return (
        <ol className="flex flex-col items-center gap-1" data-testid="note-view-flowchart">
          {note.steps.map((step, index) => (
            <li key={index} className="flex w-full flex-col items-center">
              <span className="w-full max-w-sm rounded-xl border border-line bg-surface px-3 py-2 text-center text-sm text-ink">
                {step}
              </span>
              {index < note.steps.length - 1 ? <ArrowDown className="my-0.5 h-4 w-4 text-accent" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>
      );
  }
}
