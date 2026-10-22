"use client";

import React, { useMemo, useState } from "react";
import type { AiGatewayExecutionResult } from "@/lib/ai/gateway";
import {
  composeRevisionFromMisses,
  identifyIncorrectAnswers,
  weakConceptsFromMisses,
} from "@/lib/ai/lens-compose";
import type { HighlightLensType } from "@/lib/prakriti/config";
import { ConceptDiagramSvg, FlowchartSvg, MindMapSvg } from "@/components/reader/StudyDiagrams";
import { StudyMarkdown } from "@/components/reader/StudyMarkdown";

type IllustrativeTab = "flowchart" | "mind_map" | "concept_diagram" | "analogy";
type RevisionTab =
  | "summary"
  | "points"
  | "table"
  | "memory"
  | "practice";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="font-display text-sm text-heading">{children}</h4>;
}

function ExplainOutput({ result }: { result: AiGatewayExecutionResult }) {
  const sections = result.payload.explain;
  const [depth, setDepth] = useState<"simple" | "standard" | "deeper">("standard");
  if (!sections) {
    return (
      <StudyMarkdown
        markdown={result.payload.markdown_body}
        diagram={result.payload.diagram}
      />
    );
  }
  const explanation =
    depth === "simple"
      ? sections.simpleExplanation
      : depth === "deeper"
        ? sections.deeperExplanation ?? sections.standardExplanation ?? sections.simpleExplanation
        : sections.standardExplanation ?? sections.simpleExplanation;
  return (
    <div data-testid="explain-output" className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["simple", "Simple"],
            ["standard", "Standard"],
            ["deeper", "Deeper"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`explain-depth-${id}`}
            onClick={() => setDepth(id)}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium ${
              depth === id ? "bg-selected text-heading" : "text-muted hover:bg-beige-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <section>
        <SectionTitle>
          {depth === "simple"
            ? "Simple explanation"
            : depth === "deeper"
              ? "Deeper explanation"
              : "Standard explanation"}
        </SectionTitle>
        <p
          className="mt-2 text-sm leading-relaxed text-ink"
          data-testid={depth === "simple" ? "explain-class-band" : undefined}
        >
          {explanation}
        </p>
      </section>
      <section>
        <SectionTitle>Important concepts</SectionTitle>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {sections.importantConcepts.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
      <section>
        <SectionTitle>Relevant example</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">{sections.relevantExample}</p>
      </section>
      <section>
        <SectionTitle>Key takeaway</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">{sections.keyTakeaway}</p>
      </section>
    </div>
  );
}

function StoryOutput({ result }: { result: AiGatewayExecutionResult }) {
  const story = result.payload.story;
  if (!story) {
    return <StudyMarkdown markdown={result.payload.markdown_body} />;
  }
  return (
    <div data-testid="story-output" className="space-y-4">
      <section>
        <SectionTitle>Opening</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">{story.opening}</p>
      </section>
      <section>
        <SectionTitle>Turning point</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">{story.turningPoint}</p>
      </section>
      <section>
        <SectionTitle>Close</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-ink">{story.close}</p>
      </section>
    </div>
  );
}

function IllustrateOutput({ result }: { result: AiGatewayExecutionResult }) {
  const bundle = result.payload.illustrative;
  const [tab, setTab] = useState<IllustrativeTab>("flowchart");
  const flowchart = bundle?.flowchart ?? result.payload.diagram;
  if (!bundle && !flowchart) {
    return <StudyMarkdown markdown={result.payload.markdown_body} />;
  }
  return (
    <div data-testid="illustrate-output" className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["flowchart", "Flowchart"],
            ["mind_map", "Mind Map"],
            ["concept_diagram", "Concept Diagram"],
            ["analogy", "Analogy"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`illustrate-tab-${id}`}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium ${
              tab === id ? "bg-selected text-heading" : "text-muted hover:bg-beige-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "flowchart" && flowchart ? <FlowchartSvg diagram={flowchart} /> : null}
      {tab === "mind_map" && bundle ? <MindMapSvg diagram={bundle.mindMap} /> : null}
      {tab === "concept_diagram" && bundle ? (
        <ConceptDiagramSvg diagram={bundle.conceptDiagram} />
      ) : null}
      {tab === "analogy" && bundle ? (
        <div data-testid="study-analogy" className="space-y-2 text-sm leading-relaxed text-ink">
          <p>{bundle.analogy.setup}</p>
          <p>{bundle.analogy.mapping}</p>
          <p>{bundle.analogy.takeaway}</p>
        </div>
      ) : null}
    </div>
  );
}

function ReviseOutput({ result }: { result: AiGatewayExecutionResult }) {
  const revision = result.payload.revision;
  const [tab, setTab] = useState<RevisionTab>("table");
  if (!revision) {
    return <StudyMarkdown markdown={result.payload.markdown_body} />;
  }
  return (
    <div data-testid="revise-output" className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(
          [
            ["summary", "Quick Summary"],
            ["points", "Key Points"],
            ["table", "Revision Table"],
            ["memory", "Memory Aid"],
            ["practice", "Exam Practice"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            data-testid={`revise-tab-${id}`}
            onClick={() => setTab(id)}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium ${
              tab === id ? "bg-selected text-heading" : "text-muted hover:bg-beige-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "summary" ? (
        <p className="text-sm leading-relaxed text-ink">{revision.quickSummary}</p>
      ) : null}
      {tab === "points" ? (
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {revision.keyPoints.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      {tab === "table" ? (
        <div className="overflow-x-auto">
          <table
            data-testid="revision-table"
            className="w-full border-collapse text-left text-sm"
          >
            <thead>
              <tr>
                <th className="border-b border-line px-2 py-2 font-medium text-heading">
                  Topic
                </th>
                <th className="border-b border-line px-2 py-2 font-medium text-heading">
                  What to remember
                </th>
              </tr>
            </thead>
            <tbody>
              {revision.revisionTable.map((row) => (
                <tr key={row.topic}>
                  <td className="border-b border-line px-2 py-2 text-ink">{row.topic}</td>
                  <td className="border-b border-line px-2 py-2 text-ink">{row.remember}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {tab === "memory" ? (
        <p data-testid="memory-aid" className="text-sm leading-relaxed text-ink">
          {revision.memoryAid}
        </p>
      ) : null}
      {tab === "practice" ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {revision.examPractice.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

function TestMeOutput({
  result,
  selectedMcqOptions,
  selectedText,
  onPickMcq,
}: {
  result: AiGatewayExecutionResult;
  selectedMcqOptions: Record<number, number>;
  selectedText?: string;
  onPickMcq: (questionIndex: number, optionIndex: number) => void;
}) {
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const mcqs = result.payload.mcqs ?? [];
  const answered = mcqs.filter((_, idx) => selectedMcqOptions[idx] !== undefined).length;
  const allAnswered = mcqs.length > 0 && answered === mcqs.length;
  const misses = useMemo(
    () => identifyIncorrectAnswers(mcqs, selectedMcqOptions),
    [mcqs, selectedMcqOptions]
  );
  const weakConcepts = useMemo(() => weakConceptsFromMisses(misses), [misses]);
  const missRevision = useMemo(() => {
    if (!allAnswered) return null;
    return composeRevisionFromMisses({
      selectedText: selectedText || result.payload.markdown_body,
      misses,
    });
  }, [allAnswered, misses, result.payload.markdown_body, selectedText]);

  return (
    <div data-testid="test-me-quiz" className="space-y-4">
      <p className="text-sm leading-relaxed text-ink">
        Answer all {mcqs.length || 10} questions from the selected passage only.
      </p>
      <p data-testid="test-me-progress" className="text-xs text-muted">
        {answered} of {mcqs.length} answered
      </p>
      {result.payload.mcqs?.map((mcq, idx) => (
        <div key={idx} className="space-y-2">
          <div className="text-sm font-medium text-heading">{mcq.question}</div>
          <div className="space-y-1.5">
            {mcq.options.map((opt, optIdx) => {
              const isPicked = selectedMcqOptions[idx] === optIdx;
              const isCorrect = optIdx === mcq.correctIndex;
              return (
                <button
                  key={optIdx}
                  type="button"
                  onClick={() => onPickMcq(idx, optIdx)}
                  className={`flex min-h-[44px] w-full items-center rounded-2xl border px-4 py-2 text-left text-xs font-medium ${
                    isPicked
                      ? isCorrect
                        ? "border-beige bg-selected text-heading"
                        : "border-line text-muted"
                      : "border-line text-ink"
                  }`}
                >
                  {String.fromCharCode(65 + optIdx)}. {opt}
                </button>
              );
            })}
          </div>
          {selectedMcqOptions[idx] !== undefined ? (
            <p
              className="pt-1 text-xs text-muted"
              data-testid={`test-me-feedback-${idx}`}
            >
              {selectedMcqOptions[idx] === mcq.correctIndex
                ? "Correct. "
                : "Not quite. "}
              {mcq.explanation}
            </p>
          ) : null}
        </div>
      ))}
      {result.payload.short_answers?.map((item, idx) => (
        <div key={`sa-${idx}`} className="space-y-2">
          <p className="text-sm font-medium text-heading">{item.prompt}</p>
          <textarea
            value={drafts[idx] ?? ""}
            onChange={(event) =>
              setDrafts((current) => ({ ...current, [idx]: event.target.value }))
            }
            rows={3}
            className="field-input text-sm"
          />
          <button
            type="button"
            onClick={() => setRevealed((current) => ({ ...current, [idx]: true }))}
            className="btn-secondary text-xs"
          >
            Check
          </button>
          {revealed[idx] ? (
            <p className="text-sm leading-relaxed text-ink">{item.sampleAnswer}</p>
          ) : null}
        </div>
      ))}
      {allAnswered ? (
        <div data-testid="test-me-review" className="space-y-3 border-t border-line pt-3">
          <h4 className="font-display text-sm text-heading">Incorrect answers</h4>
          {misses.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink">
              Every answer stayed inside the selected passage.
            </p>
          ) : (
            <ul
              data-testid="incorrect-answers"
              className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink"
            >
              {misses.map((miss) => (
                <li key={miss.questionIndex}>
                  Q{miss.questionIndex + 1}: {miss.question}
                </li>
              ))}
            </ul>
          )}
          <h4 className="font-display text-sm text-heading">Weak concepts</h4>
          <ul
            data-testid="weak-concepts"
            className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink"
          >
            {(weakConcepts.length > 0 ? weakConcepts : ["none — keep the same claims"]).map(
              (concept) => (
                <li key={concept}>{concept}</li>
              )
            )}
          </ul>
          {missRevision ? (
            <div data-testid="miss-revision">
              <h4 className="mb-2 font-display text-sm text-heading">
                Revision for missed ideas
              </h4>
              <ReviseOutput
                result={{
                  ...result,
                  payload: { ...result.payload, revision: missRevision },
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function StudyLensOutput({
  result,
  lens,
  selectedMcqOptions,
  selectedText,
  onPickMcq,
}: {
  result: AiGatewayExecutionResult;
  lens: HighlightLensType | null;
  selectedMcqOptions: Record<number, number>;
  selectedText?: string;
  onPickMcq: (questionIndex: number, optionIndex: number) => void;
}) {
  const resolved = lens ?? (result.payload.lens_type === "deep_integrative_synthesis"
    ? "explain"
    : result.payload.lens_type);
  if (resolved === "explain") return <ExplainOutput result={result} />;
  if (resolved === "story") return <StoryOutput result={result} />;
  if (resolved === "illustrative") return <IllustrateOutput result={result} />;
  if (resolved === "high_yield_revision") return <ReviseOutput result={result} />;
  if (resolved === "test_me") {
    return (
      <TestMeOutput
        result={result}
        selectedMcqOptions={selectedMcqOptions}
        selectedText={selectedText}
        onPickMcq={onPickMcq}
      />
    );
  }
  return (
    <StudyMarkdown
      markdown={result.payload.markdown_body}
      diagram={result.payload.diagram}
    />
  );
}
