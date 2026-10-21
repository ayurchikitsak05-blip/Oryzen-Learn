"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { formatInviteCode } from "@/lib/access/gate";

interface InviteCodeRow {
  id: string;
  code: string;
  label: string | null;
  seat_limit: number | null;
  seats_used: number;
  revoked: boolean;
}

interface StudentRow {
  enrollment_id: string;
  student_id: string;
  email: string;
  full_name: string | null;
  access_status: string;
  enrollment_status: string;
}

export default function InstructorPage() {
  const [codes, setCodes] = useState<InviteCodeRow[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [label, setLabel] = useState("Batch seats");
  const [seatLimit, setSeatLimit] = useState(30);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadRoster = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/instructor/roster");
      const json = (await response.json()) as {
        error?: string;
        codes?: InviteCodeRow[];
        students?: StudentRow[];
      };
      if (!response.ok) {
        setError(json.error ?? "The class desk could not be opened.");
        return;
      }
      setCodes(json.codes ?? []);
      setStudents(json.students ?? []);
    } catch {
      setError("Network error while loading the class.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadRoster();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadRoster]);

  const createCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    const response = await fetch("/api/instructor/codes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, seatLimit }),
    });
    const json = (await response.json()) as { error?: string; displayCode?: string };
    if (!response.ok) {
      setError(json.error ?? "Could not create a class code.");
      return;
    }
    setNotice(`New class code ${json.displayCode ?? ""}.`);
    await loadRoster();
  };

  const grantByEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice(null);
    setError(null);
    const response = await fetch("/api/instructor/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "grant_email", email }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Could not grant access.");
      return;
    }
    setEmail("");
    setNotice("Class access granted.");
    await loadRoster();
  };

  const setAccess = async (studentId: string, action: "grant" | "revoke") => {
    setError(null);
    const response = await fetch("/api/instructor/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, studentId }),
    });
    const json = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(json.error ?? "Could not update that student.");
      return;
    }
    await loadRoster();
  };

  return (
    <AppChrome
      nav="marketing"
      subtitle="Class desk"
      maxWidthClass="max-w-5xl"
      actions={
        <Link href="/hub" className={ui.ghost}>
          Learning space
        </Link>
      }
    >
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-10 md:px-8">
        <div>
          <p className={ui.eyebrow}>Instructor</p>
          <h1 className={`${ui.heading} mt-2 text-4xl`}>Class desk</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Generate a batch code for seats your institute has purchased, share the invite link,
            and grant or revoke student access.
          </p>
        </div>

        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            {notice}
          </p>
        )}

        <section className="grid gap-4 md:grid-cols-2">
          <form onSubmit={createCode} className={ui.cardPad}>
            <h2 className="text-lg font-semibold">Batch access code</h2>
            <label className="mt-4 block text-xs font-medium text-muted">
              Batch name
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className={`${ui.input} mt-1`}
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-muted">
              Seats
              <input
                type="number"
                min={1}
                value={seatLimit}
                onChange={(event) => setSeatLimit(Number(event.target.value))}
                className={`${ui.input} mt-1`}
              />
            </label>
            <button
              type="submit"
              className={`${ui.primary} mt-4`}
            >
              Generate code
            </button>
          </form>

          <form onSubmit={grantByEmail} className={ui.cardPad}>
            <h2 className="text-lg font-semibold">Grant a student</h2>
            <p className="mt-2 text-sm text-muted">
              The student needs an account already. Otherwise share a batch code.
            </p>
            <label className="mt-4 block text-xs font-medium text-muted">
              Student email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={`${ui.input} mt-1`}
              />
            </label>
            <button
              type="submit"
              className={`${ui.secondary} mt-4`}
            >
              Grant class access
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Invite codes</h2>
          {loading ? (
            <p className="mt-3 text-sm text-muted">Loading class records...</p>
          ) : codes.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No codes yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {codes.map((code) => {
                const display = formatInviteCode(code.code);
                const link = `/auth?next=${encodeURIComponent(`/access?code=${display}`)}`;
                return (
                  <li
                    key={code.id}
                    className={`${ui.card} p-4 text-sm`}
                  >
                    <p className="font-semibold tracking-wide">{display}</p>
                    <p className="mt-1 text-muted">
                      {code.label || "Untitled batch"} · {code.seats_used}
                      {code.seat_limit ? ` / ${code.seat_limit}` : ""} seats
                      {code.revoked ? " · turned off" : ""}
                    </p>
                    <p className="mt-2 break-all text-muted">{link}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold">Enrolled students</h2>
          {students.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No students enrolled yet.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {students.map((student) => (
                <li
                  key={student.enrollment_id}
                  className={`${ui.card} flex flex-wrap items-center justify-between gap-3 p-4`}
                >
                  <div>
                    <p className="text-sm font-medium">{student.full_name || student.email}</p>
                    <p className="text-xs text-muted">
                      {student.email} · {student.access_status} · {student.enrollment_status}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void setAccess(student.student_id, "grant")}
                      className={`${ui.primary} text-xs`}
                    >
                      Grant
                    </button>
                    <button
                      type="button"
                      onClick={() => void setAccess(student.student_id, "revoke")}
                      className={`${ui.secondary} text-xs`}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </AppChrome>
  );
}
