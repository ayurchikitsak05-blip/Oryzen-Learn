import { afterEach, describe, expect, it, vi } from "vitest";
import {
  availablePaidProviders,
  callProviderStructuredLens,
  classifyProviderError,
  generateStudyText,
  hasAnyPaidProvider,
  planProviderAttempts,
} from "../providers";
import type { AiLensResponsePayload } from "../gateway";

const fallback: AiLensResponsePayload = {
  lens_type: "explain",
  prakriti_dosha: "Vata",
  title: "Explain This Passage",
  markdown_body: "Fallback draft about constant velocity and net force on a sliding puck.",
  key_points: ["velocity", "net force"],
  citations: [],
  used_fallback: true,
  explain: {
    simpleExplanation: "The object keeps moving unless something pushes it.",
    standardExplanation: "Newton's first law: constant velocity unless a net force acts.",
    deeperExplanation: "Name the actual pushes and pulls before you draw the diagram.",
    importantConcepts: ["velocity", "net force"],
    relevantExample: "A puck on ice keeps sliding until a stick hits it.",
    keyTakeaway: "Hold the force-to-velocity line.",
  },
};

function structuredBody() {
  return {
    title: "Explain This Passage",
    markdown_body:
      "The passage says an object keeps a constant velocity unless a net force acts on the puck.",
    key_points: ["constant velocity", "net force"],
    explain: fallback.explain,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("provider-independent adapters", () => {
  const envNames = [
    "GEMINI_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "OPENAI_API_KEY",
    "MISTRAL_API_KEY",
    "AI_GATEWAY_API_KEY",
  ] as const;
  const previous: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const name of envNames) {
      if (name in previous) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
        delete previous[name];
      }
    }
  });

  function setEnv(name: (typeof envNames)[number], value: string) {
    previous[name] = process.env[name];
    process.env[name] = value;
  }

  it("does not treat empty keys as available and never fetches", async () => {
    for (const name of envNames) setEnv(name, "");
    const fetchImpl = vi.fn();
    expect(hasAnyPaidProvider()).toBe(false);
    expect(availablePaidProviders()).toEqual([]);
    expect(planProviderAttempts("gemini-2.5-flash")).toEqual([]);
    await expect(generateStudyText({ prompt: "Explain this.", fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("plans cheapest available fallback after the preferred provider", () => {
    setEnv("OPENAI_API_KEY", "sk-test");
    setEnv("MISTRAL_API_KEY", "mst-test");
    const planned = planProviderAttempts("gemini-2.5-flash");
    expect(planned.map((item) => item.provider)).toEqual(["mistral", "openai"]);
    expect(planned[0].model).toBe("ministral-3b-2512");
    expect(planned[1].model).toBe("gpt-6-luna");
  });

  it("parses a mocked Google REST payload without printing keys", async () => {
    setEnv("GEMINI_API_KEY", "gemini-test-key");
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).not.toContain("gemini-test-key");
      return jsonResponse({
        candidates: [
          { content: { parts: [{ text: JSON.stringify(structuredBody()) }] } },
        ],
        usageMetadata: { promptTokenCount: 80, candidatesTokenCount: 40 },
      });
    });
    const result = await callProviderStructuredLens({
      provider: "google",
      model: "gemini-2.5-flash-lite",
      prompt: "Explain the passage.",
      fallback,
      fetchImpl,
    });
    expect(result.errorClass).toBeNull();
    expect(result.provider).toBe("google");
    expect(result.payload.used_fallback).toBe(false);
    expect(result.payload.explain?.simpleExplanation).toMatch(/moving|force/i);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("parses mocked OpenAI and Mistral chat completions", async () => {
    setEnv("OPENAI_API_KEY", "sk-test");
    setEnv("MISTRAL_API_KEY", "mst-test");
    const openaiFetch = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify(structuredBody()) } }],
        usage: { prompt_tokens: 70, completion_tokens: 30 },
      })
    );
    const mistralFetch = vi.fn(async (url: string) => {
      expect(url).toContain("api.mistral.ai");
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(structuredBody()) } }],
        usage: { prompt_tokens: 60, completion_tokens: 24 },
      });
    });

    const openai = await callProviderStructuredLens({
      provider: "openai",
      model: "gpt-6-luna",
      prompt: "Explain.",
      fallback,
      fetchImpl: openaiFetch,
    });
    const mistral = await callProviderStructuredLens({
      provider: "mistral",
      model: "ministral-3b-2512",
      prompt: "Explain.",
      fallback,
      fetchImpl: mistralFetch,
    });
    expect(openai.errorClass).toBeNull();
    expect(openai.model).toBe("gpt-6-luna");
    expect(mistral.errorClass).toBeNull();
    expect(mistral.model).toBe("ministral-3b-2512");
  });

  it("classifies provider errors without exposing secrets", () => {
    expect(classifyProviderError(new Error("401 unauthorized api key"))).toBe("auth");
    expect(classifyProviderError(new Error("insufficient_funds"))).toBe("billing");
    expect(classifyProviderError("timeout")).toBe("timeout");
  });
});
