export async function saveToNotebook(params: {
  subjectTitle: string;
  title: string;
  noteBody: string;
}): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const response = await fetch("/api/notes", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save_passage",
      subjectTitle: params.subjectTitle,
      title: params.title,
      noteBody: params.noteBody,
    }),
  });
  if (response.ok) return { ok: true };
  const json = (await response.json().catch(() => null)) as { error?: string } | null;
  return {
    ok: false,
    status: response.status,
    error:
      json?.error ??
      (response.status === 401
        ? "Sign in to keep this in My Notebook."
        : "My Notebook could not save this yet."),
  };
}

export function notebookSaveMessage(
  result: Awaited<ReturnType<typeof saveToNotebook>>
): string {
  if (result.ok) return "Saved to My Notebook.";
  if (result.status === 401) {
    return "Saved only on this screen. Sign in to keep it in My Notebook.";
  }
  return result.error;
}
