import { mergeBookmarks, mergeQuizProgress } from "@/lib/reader/account-sync";
import {
  listAllBookmarks,
  listBookmarks,
  replaceAllBookmarks,
  type ReaderBookmark,
} from "@/lib/reader/bookmarks";
import {
  readAllQuizProgress,
  replaceAllQuizProgress,
  type ReaderQuizProgress,
} from "@/lib/reader/quiz-progress";

type SyncPayload = {
  persist?: "local" | "server";
  bookmarks?: ReaderBookmark[];
  quizzes?: ReaderQuizProgress[];
};

async function requestSync(
  method: "GET" | "POST",
  body?: { bookmarks: ReaderBookmark[]; quizzes: ReaderQuizProgress[] }
): Promise<SyncPayload | null> {
  try {
    const response = await fetch("/api/reader/sync", {
      method,
      credentials: "same-origin",
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) return null;
    return (await response.json()) as SyncPayload;
  } catch {
    return null;
  }
}

export async function hydrateReaderAccountCopy(userId?: string | null): Promise<{
  persist: "local" | "server";
  bookmarks: ReaderBookmark[];
  quizzes: ReaderQuizProgress[];
}> {
  const localBookmarks = listAllBookmarks(userId);
  const localQuizzes = readAllQuizProgress(userId);
  const remote = await requestSync("GET");
  if (!remote || remote.persist !== "server") {
    return { persist: "local", bookmarks: localBookmarks, quizzes: localQuizzes };
  }
  const bookmarks = mergeBookmarks(localBookmarks, remote.bookmarks ?? []);
  const quizzes = mergeQuizProgress(localQuizzes, remote.quizzes ?? []);
  replaceAllBookmarks(bookmarks, userId);
  replaceAllQuizProgress(quizzes, userId);
  if (localBookmarks.length > 0 || localQuizzes.length > 0) {
    await requestSync("POST", { bookmarks, quizzes });
  }
  return { persist: "server", bookmarks, quizzes };
}

export async function pushReaderAccountCopy(userId?: string | null): Promise<void> {
  await requestSync("POST", {
    bookmarks: listAllBookmarks(userId),
    quizzes: readAllQuizProgress(userId),
  });
}

export function bookmarksForDocument(
  documentId: string,
  userId?: string | null
): ReaderBookmark[] {
  return listBookmarks(documentId, userId);
}
