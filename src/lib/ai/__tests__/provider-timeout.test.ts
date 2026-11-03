import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HEAVY_PROVIDER_CALL_TIMEOUT_MS,
  STANDARD_PROVIDER_CALL_TIMEOUT_MS,
  isHeavyStructuredLens,
  providerCallTimeoutMs,
  withProviderCallTimeout,
} from "../provider-timeout";
import { callProviderStructuredLens, type FetchLike } from "../providers";
import type { AiLensResponsePayload } from "../gateway";

const fallback: AiLensResponsePayload = {
  lens_type: "illustrative",
  prakriti_dosha: "Vata",
  title: "Illustrative View",
  markdown_body: "Fallback draft grounded in the selected passage about constant velocity.",
  key_points: ["constant velocity"],
  citations: [],
  used_fallback: true,
};

describe("provider call timeouts", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.AI_GATEWAY_API_KEY;
  });

  it("gives Illustrate and Story a longer budget than explain", () => {
    expect(isHeavyStructuredLens("illustrative")).toBe(true);
    expect(isHeavyStructuredLens("story")).toBe(true);
    expect(isHeavyStructuredLens("explain")).toBe(false);
    expect(providerCallTimeoutMs("explain")).toBe(STANDARD_PROVIDER_CALL_TIMEOUT_MS);
    expect(providerCallTimeoutMs("illustrative")).toBe(HEAVY_PROVIDER_CALL_TIMEOUT_MS);
    expect(providerCallTimeoutMs("story")).toBe(HEAVY_PROVIDER_CALL_TIMEOUT_MS);
    expect(HEAVY_PROVIDER_CALL_TIMEOUT_MS).toBeGreaterThan(STANDARD_PROVIDER_CALL_TIMEOUT_MS);
  });

  it("rejects with TimeoutError when work never settles", async () => {
    vi.useFakeTimers();
    const pending = withProviderCallTimeout(100, () => new Promise(() => undefined));
    const expectation = expect(pending).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(120);
    await expectation;
  });

  function useGeminiOnly() {
    process.env.GEMINI_API_KEY = "gemini-test";
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  }

  it("aborts a stalled Illustrate call as timeout without treating it as success", async () => {
    useGeminiOnly();
    vi.useFakeTimers();
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const pending = callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Illustrate the passage.",
      fallback,
      fetchImpl,
      maxAttempts: 1,
      lensType: "illustrative",
    });

    await vi.advanceTimersByTimeAsync(HEAVY_PROVIDER_CALL_TIMEOUT_MS + 50);
    const result = await pending;
    expect(result.errorClass).toBe("timeout");
    expect(result.provider).toBe("deterministic");
    expect(result.payload.used_fallback).toBe(true);
  });

  it("does not start a second Story attempt after a timeout", async () => {
    useGeminiOnly();
    vi.useFakeTimers();
    let attempts = 0;
    const fetchImpl: FetchLike = (_url, init) => {
      attempts += 1;
      return new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    };

    const pending = callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Tell a teaching story.",
      fallback: {
        ...fallback,
        lens_type: "story",
        title: "Story Mode",
        markdown_body: "Fallback teaching draft about constant velocity.",
        story: {
          opening: "A puck glides at constant velocity on smooth ice.",
          turningPoint: "A push becomes a net force.",
          close: "The velocity changes only after that net force acts.",
        },
      },
      fetchImpl,
      // Default would be 2; timeout must still stop after the first heavy budget.
      maxAttempts: 2,
      lensType: "story",
    });

    await vi.advanceTimersByTimeAsync(HEAVY_PROVIDER_CALL_TIMEOUT_MS + 50);
    const result = await pending;
    expect(attempts).toBe(1);
    expect(result.errorClass).toBe("timeout");
    expect(result.provider).toBe("deterministic");
    expect(result.payload.used_fallback).toBe(true);

    // A second heavy window must not remain armed after the first timeout.
    await vi.advanceTimersByTimeAsync(HEAVY_PROVIDER_CALL_TIMEOUT_MS + 50);
    expect(attempts).toBe(1);
  });

  it("lets a late Story response succeed inside the heavy budget", async () => {
    useGeminiOnly();
    vi.useFakeTimers();
    const body = {
      title: "Story Mode",
      markdown_body:
        "A teaching example: a toy boat drifts at steady speed until a child taps its side.",
      key_points: ["steady speed", "tap changes motion"],
      citations: [],
      story: {
        opening: "As a teaching example, a toy boat drifts at a steady speed.",
        turningPoint: "A child taps the side of the boat.",
        close: "After the tap, the boat turns and moves faster.",
      },
    };
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(
            new Response(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
                usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 60 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }, 25_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const pending = callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Tell a teaching story.",
      fallback: { ...fallback, lens_type: "story", title: "Story Mode" },
      fetchImpl,
      maxAttempts: 1,
      lensType: "story",
    });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(5_050);
    const result = await pending;
    expect(result.errorClass).toBeNull();
    expect(result.provider).toBe("google");
    expect(result.payload.used_fallback).toBe(false);
    expect(result.payload.story?.turningPoint).toMatch(/taps the side/i);
  });

  it("keeps the shorter explain budget so light lenses do not wait the heavy window", async () => {
    useGeminiOnly();
    vi.useFakeTimers();
    let aborted = false;
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => {
          aborted = true;
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const pending = callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Explain the passage.",
      fallback: { ...fallback, lens_type: "explain" },
      fetchImpl,
      maxAttempts: 1,
      lensType: "explain",
    });

    await vi.advanceTimersByTimeAsync(STANDARD_PROVIDER_CALL_TIMEOUT_MS + 25);
    const result = await pending;
    expect(aborted).toBe(true);
    expect(result.errorClass).toBe("timeout");
  });

  it("lets a late Illustrate response succeed inside the heavy budget", async () => {
    useGeminiOnly();
    vi.useFakeTimers();
    const body = {
      title: "Illustrative View",
      markdown_body:
        "The passage says an object keeps a constant velocity unless a net force acts.",
      key_points: ["constant velocity", "net force"],
      citations: [],
      diagram: {
        title: "Force line",
        kind: "flowchart",
        nodes: [
          { id: "idea", label: "constant velocity" },
          { id: "claim", label: "a net force" },
          { id: "check", label: "Newton's first law" },
        ],
        edges: [
          { from: "idea", to: "claim", label: "unless" },
          { from: "claim", to: "check", label: "then" },
        ],
      },
      illustrative: {
        flowchart: {
          title: "Force line",
          kind: "flowchart",
          nodes: [
            { id: "idea", label: "constant velocity" },
            { id: "claim", label: "a net force" },
            { id: "check", label: "Newton's first law" },
          ],
          edges: [
            { from: "idea", to: "claim", label: "unless" },
            { from: "claim", to: "check", label: "then" },
          ],
        },
        mindMap: {
          title: "Force line",
          kind: "mind_map",
          nodes: [
            { id: "idea", label: "constant velocity" },
            { id: "claim", label: "a net force" },
            { id: "check", label: "Newton's first law" },
          ],
          edges: [
            { from: "idea", to: "claim", label: "unless" },
            { from: "claim", to: "check", label: "then" },
          ],
        },
        conceptDiagram: {
          title: "Force line",
          kind: "concept_diagram",
          nodes: [
            { id: "idea", label: "constant velocity" },
            { id: "claim", label: "a net force" },
            { id: "check", label: "Newton's first law" },
          ],
          edges: [
            { from: "idea", to: "claim", label: "unless" },
            { from: "claim", to: "check", label: "then" },
          ],
        },
      },
    };
    const fetchImpl: FetchLike = (_url, init) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          resolve(
            new Response(
              JSON.stringify({
                candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }],
                usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 80 },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }, 25_000);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    const pending = callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Illustrate the passage.",
      fallback,
      fetchImpl,
      maxAttempts: 1,
      lensType: "illustrative",
    });

    // Still inside the old 20s window → would have timed out before this fix.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    await vi.advanceTimersByTimeAsync(5_050);
    const result = await pending;
    expect(result.errorClass).toBeNull();
    expect(result.provider).toBe("google");
    expect(result.payload.used_fallback).toBe(false);
    expect(result.payload.markdown_body).toMatch(/net force/i);
    // Timeout path under test: model body accepted after 25s. Diagram quality
    // filters are covered in lens-quality tests; do not couple budgets to them.
    expect(result.payload.missingStructure ?? []).not.toContain("markdown_body");
  });
});
