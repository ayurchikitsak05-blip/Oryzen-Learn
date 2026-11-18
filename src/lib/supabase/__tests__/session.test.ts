import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSessionReply, fetchSignedInUser } from "../session";

afterEach(() => {
  clearSessionReply();
  vi.unstubAllGlobals();
});

describe("who is signed in", () => {
  it("asks the server once for everything that asks at the same time, and reuses the answer briefly", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ userId: "student-a", email: null })));
    vi.stubGlobal("fetch", fetchMock);
    const answers = await Promise.all([fetchSignedInUser(), fetchSignedInUser(), fetchSignedInUser()]);
    expect(answers.map((user) => user?.userId)).toEqual(["student-a", "student-a", "student-a"]);
    expect((await fetchSignedInUser())?.userId).toBe("student-a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again after sign-in or sign-out clears the answer", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ userId: "student-a" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Sign in required." }), { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await fetchSignedInUser())?.userId).toBe("student-a");
    clearSessionReply();
    expect(await fetchSignedInUser()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
