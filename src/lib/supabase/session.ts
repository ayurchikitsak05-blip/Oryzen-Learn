export interface SignedInUser {
  userId: string;
  email: string | null;
}

export async function fetchSignedInUser(): Promise<SignedInUser | null> {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
  });
  if (!response.ok) return null;
  const json = (await response.json()) as {
    userId?: string;
    email?: string | null;
  };
  if (!json.userId) return null;
  return { userId: json.userId, email: json.email ?? null };
}
