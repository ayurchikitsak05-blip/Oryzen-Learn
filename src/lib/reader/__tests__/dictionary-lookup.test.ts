import { afterEach, describe, expect, it, vi } from "vitest";
import { lookupDictionaryEntry } from "../dictionary-lookup";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hangingFetch(signal?: AbortSignal): Promise<Response> {
  return new Promise((_, reject) => {
    const fail = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) {
      fail();
      return;
    }
    signal?.addEventListener("abort", fail, { once: true });
  });
}

describe("dictionary lookup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("returns a definition on success", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        {
          phonetic: "/fɔːs/",
          meanings: [
            {
              partOfSpeech: "noun",
              definitions: [{ definition: "A push or pull on an object." }],
            },
          ],
        },
      ])
    );

    const result = await lookupDictionaryEntry("Force", {
      fetchImpl: fetchImpl as typeof fetch,
      timeoutMs: 200,
    });
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.entry.word).toBe("force");
      expect(result.entry.definition).toMatch(/push or pull/i);
      expect(result.entry.partOfSpeech).toBe("noun");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("times out instead of hanging on a slow public API", async () => {
    vi.useFakeTimers();
    const fetchImpl: typeof fetch = (_url, init) => hangingFetch(init?.signal ?? undefined);
    const pending = lookupDictionaryEntry("joule", { fetchImpl, timeoutMs: 25 });
    await vi.advanceTimersByTimeAsync(30);
    const result = await pending;
    expect(result.status).toBe("timeout");
  });

  it("returns error when both sources fail, and missing on 404", async () => {
    const failing = vi.fn(async () => new Response("down", { status: 503 }));
    const failed = await lookupDictionaryEntry("watt", {
      fetchImpl: failing as typeof fetch,
      timeoutMs: 200,
    });
    expect(failed.status).toBe("error");
    expect(failing).toHaveBeenCalledTimes(2);

    const missingFetch = vi.fn(async () => new Response("not found", { status: 404 }));
    const missing = await lookupDictionaryEntry("xyzzy", {
      fetchImpl: missingFetch as typeof fetch,
      timeoutMs: 200,
    });
    expect(missing.status).toBe("missing");
  });
});
