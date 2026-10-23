import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mergeBookmarks, mergeQuizProgress } from "@/lib/reader/account-sync";
import type { ReaderBookmark } from "@/lib/reader/bookmarks";
import {
  quizProgressId,
  type ReaderQuizProgress,
} from "@/lib/reader/quiz-progress";

async function signedInClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function missingTable(message: string): boolean {
  return /student_bookmarks|student_quiz_progress|schema cache|does not exist/i.test(
    message
  );
}

function asBookmarks(rows: Array<Record<string, unknown>> | null): ReaderBookmark[] {
  return (rows ?? []).flatMap((row) => {
    const documentId = String(row.document_id ?? "");
    const pageNumber = Number(row.page_number);
    if (!documentId || !Number.isFinite(pageNumber)) return [];
    return [
      {
        documentId,
        pageNumber,
        label: String(row.label ?? `Page ${pageNumber}`),
        createdAt: String(row.created_at ?? new Date().toISOString()),
      },
    ];
  });
}

function asQuizzes(rows: Array<Record<string, unknown>> | null): ReaderQuizProgress[] {
  return (rows ?? []).flatMap((row) => {
    const documentId = String(row.document_id ?? "");
    const pageNumber = Number(row.page_number);
    const selectionKey = String(row.selection_key ?? "");
    if (!documentId || !selectionKey || !Number.isFinite(pageNumber)) return [];
    return [
      {
        documentId,
        documentTitle: String(row.document_title ?? ""),
        pageNumber,
        selectionKey,
        answers:
          row.answers && typeof row.answers === "object"
            ? (row.answers as Record<number, number>)
            : {},
        weakConcepts: Array.isArray(row.weak_concepts)
          ? row.weak_concepts.map((item) => String(item))
          : [],
        completed: Boolean(row.completed),
        updatedAt: String(row.updated_at ?? new Date().toISOString()),
      },
    ];
  });
}

export async function GET() {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to keep bookmarks and quizzes.", persist: "local" },
      { status: 401 }
    );
  }

  const bookmarks = await supabase
    .from("student_bookmarks")
    .select("document_id, page_number, label, created_at")
    .eq("user_id", user.id);
  const quizzes = await supabase
    .from("student_quiz_progress")
    .select(
      "progress_key, document_id, document_title, page_number, selection_key, answers, weak_concepts, completed, updated_at"
    )
    .eq("user_id", user.id);

  if (bookmarks.error || quizzes.error) {
    const message = bookmarks.error?.message ?? quizzes.error?.message ?? "";
    if (missingTable(message)) {
      return NextResponse.json({
        persist: "local",
        reason: "table_missing",
        bookmarks: [],
        quizzes: [],
      });
    }
    return NextResponse.json(
      { error: "Account copies could not be reached.", persist: "local" },
      { status: 503 }
    );
  }

  return NextResponse.json({
    persist: "server",
    bookmarks: asBookmarks(bookmarks.data),
    quizzes: asQuizzes(quizzes.data),
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await signedInClient();
  if (!user) {
    return NextResponse.json(
      { error: "Sign in to keep bookmarks and quizzes.", persist: "local" },
      { status: 401 }
    );
  }

  const body = (await request.json()) as {
    bookmarks?: ReaderBookmark[];
    quizzes?: ReaderQuizProgress[];
  };
  const incomingBookmarks = Array.isArray(body.bookmarks) ? body.bookmarks : [];
  const incomingQuizzes = Array.isArray(body.quizzes) ? body.quizzes : [];

  const existingBookmarks = await supabase
    .from("student_bookmarks")
    .select("document_id, page_number, label, created_at")
    .eq("user_id", user.id);
  const existingQuizzes = await supabase
    .from("student_quiz_progress")
    .select(
      "document_id, document_title, page_number, selection_key, answers, weak_concepts, completed, updated_at"
    )
    .eq("user_id", user.id);

  if (existingBookmarks.error || existingQuizzes.error) {
    const message =
      existingBookmarks.error?.message ?? existingQuizzes.error?.message ?? "";
    if (missingTable(message)) {
      return NextResponse.json({
        persist: "local",
        reason: "table_missing",
        bookmarks: incomingBookmarks,
        quizzes: incomingQuizzes,
      });
    }
    return NextResponse.json(
      { error: "Account copies could not be reached.", persist: "local" },
      { status: 503 }
    );
  }

  const mergedBookmarks = mergeBookmarks(
    incomingBookmarks,
    asBookmarks(existingBookmarks.data)
  );
  const mergedQuizzes = mergeQuizProgress(
    incomingQuizzes,
    asQuizzes(existingQuizzes.data)
  );

  if (mergedBookmarks.length > 0) {
    const { error } = await supabase.from("student_bookmarks").upsert(
      mergedBookmarks.map((item) => ({
        user_id: user.id,
        document_id: item.documentId,
        page_number: item.pageNumber,
        label: item.label.slice(0, 180),
        created_at: item.createdAt,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,document_id,page_number" }
    );
    if (error) {
      return NextResponse.json(
        { error: "Bookmarks could not be saved to this account.", persist: "local" },
        { status: 500 }
      );
    }
  }

  if (mergedQuizzes.length > 0) {
    const { error } = await supabase.from("student_quiz_progress").upsert(
      mergedQuizzes.map((item) => ({
        user_id: user.id,
        progress_key: quizProgressId(item.documentId, item.pageNumber, item.selectionKey),
        document_id: item.documentId,
        document_title: item.documentTitle.slice(0, 180),
        page_number: item.pageNumber,
        selection_key: item.selectionKey.slice(0, 180),
        answers: item.answers,
        weak_concepts: item.weakConcepts,
        completed: item.completed,
        updated_at: item.updatedAt,
      })),
      { onConflict: "user_id,progress_key" }
    );
    if (error) {
      return NextResponse.json(
        { error: "Quiz progress could not be saved to this account.", persist: "local" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    persist: "server",
    bookmarks: mergedBookmarks,
    quizzes: mergedQuizzes,
  });
}
