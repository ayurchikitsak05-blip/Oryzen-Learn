import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: Array<Record<string, unknown>> = [];
let existing: Array<{ id: string; title: string }> = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "student-a" } } }) },
    from: () => ({
      select: () => ({ eq: async () => ({ data: existing, error: null }) }),
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return { select: () => ({ single: async () => ({ data: { id: `new-${inserted.length}` }, error: null }) }) };
      },
    }),
  }),
}));

import { POST } from "../route";

function createSubject(title: string) {
  return POST(
    new Request("http://localhost/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_subject", title }),
    }) as never
  );
}

describe("adding a subject in My Notes", () => {
  beforeEach(() => {
    inserted.length = 0;
    existing = [];
  });

  it("reuses a subject with the same name instead of making a duplicate", async () => {
    existing = [{ id: "hindi-1", title: "Hindi" }];
    const response = await createSubject(" hindi ");
    expect(await response.json()).toMatchObject({ id: "hindi-1", existing: true });
    expect(inserted).toHaveLength(0);
  });

  it("creates a new subject when the name is new", async () => {
    existing = [{ id: "hindi-1", title: "Hindi" }];
    const response = await createSubject("Physics");
    expect(await response.json()).toMatchObject({ id: "new-1" });
    expect(inserted).toEqual([{ user_id: "student-a", title: "Physics" }]);
  });
});
