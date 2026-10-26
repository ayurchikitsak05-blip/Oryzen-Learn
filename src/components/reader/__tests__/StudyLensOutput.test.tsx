import React from "react";
import { fireEvent, render, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudyLensOutput } from "../StudyLensOutput";
import type { AiGatewayExecutionResult } from "@/lib/ai/gateway";

function result(
  payload: AiGatewayExecutionResult["payload"],
  fallback = false
): AiGatewayExecutionResult {
  return {
    cacheHit: false,
    cacheKey: "k",
    normalizedSelectionHash: "h",
    requestedModel: "gemini-3.5-flash-lite",
    modelUsed: fallback ? "deterministic" : "gemini-3.5-flash-lite",
    requestedProvider: "google",
    providerUsed: fallback ? "deterministic" : "google",
    usedProviderFallback: false,
    downgradedToFlashLite: false,
    promptTokens: fallback ? 0 : 200,
    completionTokens: fallback ? 0 : 120,
    totalTokens: fallback ? 0 : 320,
    costInr: 0,
    monthlySpendBeforeInr: 0,
    monthlySpendAfterInr: 0,
    walletCapInr: 70,
    ragContextChunksUsed: 1,
    usedDeterministicFallback: fallback,
    budgetBlocked: false,
    cacheScope: "private",
    fallbackReason: fallback ? "unusable_model_output" : null,
    geminiErrorClass: null,
    providerErrorClass: null,
    providerErrorDetail: null,
    payload,
  };
}

const base = {
  prakriti_dosha: "Vata" as const,
  title: "Newton",
  key_points: ["constant velocity"],
  citations: [],
  used_fallback: false,
};

describe("student study screens", () => {
  it("shows three different explanation depths from the model", () => {
    const view = render(
      <StudyLensOutput
        lens="explain"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "explain",
          markdown_body: "Combined explanation.",
          explain: {
            simpleExplanation: "A puck keeps sliding until something pushes it.",
            standardExplanation:
              "Newton's first law says velocity stays constant unless a net force acts.",
            deeperExplanation:
              "Motion continues on its own. A force is needed only when the velocity changes, as friction or a stick does to the puck.",
            importantConcepts: ["constant velocity", "net force"],
            relevantExample: "A puck on ice keeps sliding until a stick hits it.",
            keyTakeaway: "Velocity stays the same until a leftover force changes it.",
          },
        })}
      />
    );
    expect(view.getByTestId("explain-body").textContent).toMatch(/velocity stays constant/i);
    fireEvent.click(view.getByTestId("explain-depth-simple"));
    expect(view.getByTestId("explain-body").textContent).toMatch(/puck keeps sliding/i);
    fireEvent.click(view.getByTestId("explain-depth-deeper"));
    expect(view.getByTestId("explain-body").textContent).toMatch(/Motion continues/i);
    expect(view.queryByText(/source-grounded study draft/i)).toBeNull();
  });

  it("shows the model's paragraph when a flowchart was not returned", () => {
    const view = render(
      <StudyLensOutput
        lens="illustrative"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "illustrative",
          markdown_body:
            "A hockey puck on ice continues sliding until a stick or friction changes its velocity.",
          missingStructure: ["illustrative"],
        })}
      />
    );
    expect(view.getByTestId("ai-partial-structure").textContent).toMatch(/no trustworthy flowchart/i);
    expect(view.getByTestId("ai-partial-structure").textContent).toMatch(/hockey puck/i);
    expect(view.getByTestId("ai-partial-structure").textContent).not.toMatch(
      /keeps going the same way/i
    );
  });

  it("renders flowchart nodes and a real quiz", () => {
    const diagram = render(
      <StudyLensOutput
        lens="illustrative"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "illustrative",
          markdown_body: "Velocity changes only when a net force acts.",
          illustrative: {
            flowchart: {
              title: "When velocity changes",
              kind: "flowchart",
              nodes: [
                { id: "keep", label: "Object keeps constant velocity" },
                { id: "force", label: "A net force acts" },
              ],
              edges: [{ from: "keep", to: "force", label: "unless" }],
            },
            mindMap: {
              title: "First law",
              kind: "mind_map",
              nodes: [
                { id: "law", label: "Newton's first law" },
                { id: "net", label: "Unless a net force" },
              ],
              edges: [{ from: "law", to: "net" }],
            },
          },
        })}
      />
    );
    expect(diagram.getByTestId("study-flowchart").textContent).toMatch(/constant velocity/i);
    expect(diagram.getByTestId("study-flowchart").textContent).toMatch(/net force/i);

    const chain = render(
      <StudyLensOutput
        lens="illustrative"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "illustrative",
          markdown_body: "The rebellion then changed control then the crown ruled.",
          illustrative: {
            flowchart: {
              title: "The sequence this passage states",
              kind: "flowchart",
              nodes: [
                { id: "step-1", label: "soldiers began the rebellion" },
                { id: "step-2", label: "company lost control" },
                { id: "step-3", label: "crown took direct rule" },
              ],
              edges: [
                { from: "step-1", to: "step-2", label: "next" },
                { from: "step-2", to: "step-3", label: "next" },
              ],
            },
          },
        })}
      />
    );
    const chainText = within(chain.container).getByTestId("study-flowchart").textContent ?? "";
    expect(chainText.match(/company lost control/gi)).toHaveLength(1);
    expect(chainText.indexOf("soldiers began the rebellion")).toBeLessThan(
      chainText.indexOf("company lost control")
    );
    expect(chainText.indexOf("company lost control")).toBeLessThan(
      chainText.indexOf("crown took direct rule")
    );
    expect(chainText.indexOf("next")).toBeLessThan(chainText.lastIndexOf("next"));
    chain.unmount();
    fireEvent.click(diagram.getByTestId("illustrate-tab-mind_map"));
    expect(diagram.getByTestId("study-mind-map").textContent).toMatch(/Newton's/);
    expect(diagram.getByTestId("study-mind-map").textContent).toMatch(/first law/);
    expect(diagram.getByTestId("study-mind-map").textContent).toMatch(/net/);
    expect(diagram.getByTestId("study-mind-map").textContent).toMatch(/force/);

    const reversed = render(
      <StudyLensOutput
        lens="illustrative"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "illustrative",
          markdown_body: "Velocity stays constant unless a net force acts.",
          illustrative: {
            mindMap: {
              title: "First law",
              kind: "mind_map",
              nodes: [
                { id: "force", label: "net force" },
                { id: "velocity", label: "constant velocity" },
              ],
              edges: [{ from: "velocity", to: "force", label: "unless" }],
            },
          },
        })}
      />
    );
    const readingOrder = within(reversed.container).getByTestId("study-mind-map").textContent ?? "";
    expect(readingOrder.indexOf("constant velocity")).toBeLessThan(readingOrder.indexOf("unless"));
    expect(readingOrder.indexOf("unless")).toBeLessThan(readingOrder.indexOf("net force"));

    const quiz = render(
      <StudyLensOutput
        lens="test_me"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "test_me",
          markdown_body: "Velocity stays constant unless a net force acts.",
          mcqs: [
            {
              question: "What stays the same until a net force acts on the puck?",
              options: [
                "Only the colour of the puck.",
                "The object's velocity, its speed and direction.",
                "The mass of the puck must double.",
                "The puck must stop as soon as the push ends.",
              ],
              correctIndex: 1,
              explanation: "The first law keeps velocity constant until a net force acts.",
              citationLabel: "[Page 1]",
            },
          ],
        })}
      />
    );
    expect(quiz.getByTestId("test-me-quiz").textContent).toMatch(/What stays the same/);
    expect(quiz.getByTestId("test-me-quiz").textContent).toMatch(/Answer the question from the selected passage only/);
  });

  it("opens a concept map when the flowchart is missing and offers another try", () => {
    const onRetry = vi.fn();
    const view = render(
      <StudyLensOutput
        lens="illustrative"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        onRetry={onRetry}
        result={result({
          ...base,
          lens_type: "illustrative",
          markdown_body: "Area is length times width.",
          missingStructure: ["flowchart"],
          illustrative: {
            mindMap: {
              title: "Rectangle area",
              kind: "mind_map",
              nodes: [
                { id: "hub", label: "Rectangle area" },
                { id: "rule", label: "Length times width" },
                { id: "example", label: "8 cm by 5 cm equals 40 square centimetres" },
              ],
              edges: [
                { from: "hub", to: "rule", label: "defined as" },
                { from: "hub", to: "example", label: "example" },
              ],
            },
          },
        })}
      />
    );
    expect(view.getByTestId("study-mind-map").textContent).toMatch(/Length times width/);
    expect(view.getByTestId("study-mind-map").textContent).toMatch(/40 square centimetres/);
    expect(view.getByTestId("study-mind-map").textContent).toMatch(/defined as/);
    expect(view.queryByTestId("study-flowchart")).toBeNull();
    expect(view.getByTestId("diagram-fallback-note").textContent).toMatch(/no trustworthy flowchart/i);
    fireEvent.click(view.getByTestId("diagram-retry"));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("labels a story as a teaching example", () => {
    const view = render(
      <StudyLensOutput
        lens="story"
        selectedMcqOptions={{}}
        onPickMcq={() => undefined}
        result={result({
          ...base,
          lens_type: "story",
          markdown_body: "A teaching scene about constant velocity.",
          story: {
            opening: "An ice hockey puck glides across a frictionless sheet of ice.",
            turningPoint: "A gust of wind pushes the puck.",
            close: "The push changes the velocity, which is what a net force does.",
          },
        })}
      />
    );
    expect(view.getByTestId("story-teaching-note").textContent).toMatch(/not facts from the textbook/i);
    expect(view.getByTestId("story-output").textContent).toMatch(/ice hockey puck/i);
  });
});
