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
  return <h4 className="font-reading text-heading">{children}</h4>;
}

function RetryStudyButton({ onRetry }: { onRetry?: () => void }) {
  if (!onRetry) return null;
  return (
    <button
      type="button"
      data-testid="diagram-retry"
      onClick={onRetry}
      className="btn-primary text-xs"
    >
      Try again
    </button>
  );
}

function PartialModelAnswer({
  result,
  message,
  onRetry,
}: {
  result: AiGatewayExecutionResult;
  message: string;
  onRetry?: () => void;
}) {
  const retry = result.usedDeterministicFallback ? undefined : onRetry;
  return (
    <div data-testid="ai-partial-structure" className="font-reading space-y-3">
      <p className="text-sm font-medium text-muted">{message}</p>
      <StudyMarkdown markdown={result.payload.markdown_body} />
      <RetryStudyButton onRetry={retry} />
    </div>
  );
}

function ExplainOutput({ result }: { result: AiGatewayExecutionResult }) {
  const sections = result.payload.explain;
  const [depth, setDepth] = useState<"simple" | "standard" | "deeper">("standard");
  if (!sections) {
    return (
      <PartialModelAnswer
        result={result}
        message="The model did not return separate Simple, Standard, and Deeper explanations. Showing its written answer."
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
    <div data-testid="explain-output" className="font-reading space-y-4">
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
          data-testid="explain-body"
          className="mt-2 text-sm leading-relaxed text-ink"
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
    return (
      <PartialModelAnswer
        result={result}
        message="The model did not return a structured story. Showing its written answer."
      />
    );
  }
  return (
    <div data-testid="story-output" className="font-reading space-y-4">
      <p data-testid="story-teaching-note" className="text-sm leading-relaxed text-muted">
        Teaching example. The people and events below are invented to explain the page.
        They are not facts from the textbook.
      </p>
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

function preferredDiagramTab(
  flowchart: boolean,
  mindMap: boolean,
  conceptDiagram: boolean,
  analogy: boolean
): IllustrativeTab {
  if (flowchart) return "flowchart";
  if (mindMap) return "mind_map";
  if (conceptDiagram) return "concept_diagram";
  if (analogy) return "analogy";
  return "flowchart";
}

function IllustrateOutput({
  result,
  onRetry,
}: {
  result: AiGatewayExecutionResult;
  onRetry?: () => void;
}) {
  const bundle = result.payload.illustrative;
  const flowchart = bundle?.flowchart ?? result.payload.diagram;
  const hasDiagram = Boolean(flowchart || bundle?.mindMap || bundle?.conceptDiagram);
  const preferred = preferredDiagramTab(
    Boolean(flowchart),
    Boolean(bundle?.mindMap),
    Boolean(bundle?.conceptDiagram),
    Boolean(bundle?.analogy)
  );
  const [chosen, setChosen] = useState<IllustrativeTab | null>(null);
  const tab = chosen ?? preferred;
  const retry = result.usedDeterministicFallback ? undefined : onRetry;
  if (!hasDiagram) {
    return (
      <div data-testid="ai-partial-structure" className="font-reading space-y-3">
        <p className="text-sm font-medium text-muted">
          No trustworthy flowchart or concept map is available for this passage. The written explanation is below.
        </p>
        {bundle?.analogy ? (
          <div data-testid="study-analogy" className="space-y-2 text-sm leading-relaxed text-ink">
            <p className="text-muted">
              Teaching analogy. This scene is not a quotation from the page.
            </p>
            <p>{bundle.analogy.setup}</p>
            <p>{bundle.analogy.mapping}</p>
            <p>{bundle.analogy.takeaway}</p>
          </div>
        ) : null}
        <StudyMarkdown markdown={result.payload.markdown_body} />
        <RetryStudyButton onRetry={retry} />
      </div>
    );
  }
  return (
    <div data-testid="illustrate-output" className="font-reading space-y-3">
      {!flowchart ? (
        <div className="space-y-2">
          <p data-testid="diagram-fallback-note" className="text-sm text-muted">
            No trustworthy flowchart is available. Showing the diagram that matches the passage.
          </p>
          <RetryStudyButton onRetry={retry} />
        </div>
      ) : null}
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
            onClick={() => setChosen(id)}
            className={`inline-flex min-h-10 items-center rounded-xl px-3 text-xs font-medium ${
              tab === id ? "bg-selected text-heading" : "text-muted hover:bg-beige-2"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "flowchart" && flowchart ? <FlowchartSvg diagram={flowchart} /> : null}
      {tab === "flowchart" && !flowchart ? (
        <p data-testid="diagram-missing" className="text-sm text-muted">
          This passage does not state a flowchart we can draw.
        </p>
      ) : null}
      {tab === "mind_map" && bundle?.mindMap ? <MindMapSvg diagram={bundle.mindMap} /> : null}
      {tab === "mind_map" && !bundle?.mindMap ? (
        <p data-testid="diagram-missing" className="text-sm text-muted">
          No trustworthy concept map is available for this passage.
        </p>
      ) : null}
      {tab === "concept_diagram" && bundle?.conceptDiagram ? (
        <ConceptDiagramSvg diagram={bundle.conceptDiagram} />
      ) : null}
      {tab === "concept_diagram" && !bundle?.conceptDiagram ? (
        <p data-testid="diagram-missing" className="text-sm text-muted">
          This passage does not state a concept diagram we can draw.
        </p>
      ) : null}
      {tab === "analogy" && bundle?.analogy ? (
        <div data-testid="study-analogy" className="space-y-2 text-sm leading-relaxed text-ink">
          <p className="text-muted">
            Teaching analogy. This scene is not a quotation from the page.
          </p>
          <p>{bundle.analogy.setup}</p>
          <p>{bundle.analogy.mapping}</p>
          <p>{bundle.analogy.takeaway}</p>
        </div>
      ) : null}
      {tab === "analogy" && !bundle?.analogy ? (
        <p data-testid="diagram-missing" className="text-sm text-muted">
          The model did not return an analogy.
        </p>
      ) : null}
    </div>
  );
}

function ReviseOutput({ result }: { result: AiGatewayExecutionResult }) {
  const revision = result.payload.revision;
  const [tab, setTab] = useState<RevisionTab>("table");
  if (!revision) {
    return (
      <PartialModelAnswer
        result={result}
        message="The model did not return a revision table. Showing its written answer."
      />
    );
  }
  return (
    <div data-testid="revise-output" className="font-reading space-y-3">
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
      {tab === "memory" && revision.memoryAid ? (
        <p data-testid="memory-aid" className="text-sm leading-relaxed text-ink">
          {revision.memoryAid}
        </p>
      ) : null}
      {tab === "memory" && !revision.memoryAid ? (
        <p className="text-sm text-muted">The model did not return a memory aid.</p>
      ) : null}
      {tab === "practice" && revision.examPractice.length > 0 ? (
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
  if (mcqs.length === 0) {
    return (
      <PartialModelAnswer
        result={result}
        message="The model did not return questions. Showing its written answer."
      />
    );
  }

  return (
    <div data-testid="test-me-quiz" className="font-reading space-y-4">
      <p className="text-sm leading-relaxed text-ink">
        {mcqs.length === 1
          ? "Answer the question from the selected passage only."
          : `Answer all ${mcqs.length} questions from the selected passage only.`}
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
  onRetry,
}: {
  result: AiGatewayExecutionResult;
  lens: HighlightLensType | "ask_my_book" | null;
  selectedMcqOptions: Record<number, number>;
  selectedText?: string;
  onPickMcq: (questionIndex: number, optionIndex: number) => void;
  onRetry?: () => void;
}) {
  const resolved = lens ?? (result.payload.lens_type === "deep_integrative_synthesis"
    ? "explain"
    : result.payload.lens_type);
  if (resolved === "ask_my_book") {
    const asked = result.payload.askMyBook;
    return (
      <div data-testid="ask-my-book-output" className="font-reading space-y-3">
        <p className="text-sm text-heading">{asked?.question ?? "Your question"}</p>
        <div className="text-sm leading-relaxed text-ink [&_p]:whitespace-pre-wrap [&_p]:break-words">
          {asked?.answer ? (
            <StudyMarkdown markdown={asked.answer} />
          ) : (
            <PartialModelAnswer
              result={result}
              message="The model did not return a source-grounded answer. Showing its written answer."
            />
          )}
        </div>
      </div>
    );
  }
  if (resolved === "explain") return <ExplainOutput result={result} />;
  if (resolved === "story") return <StoryOutput result={result} />;
  if (resolved === "illustrative") return <IllustrateOutput result={result} onRetry={onRetry} />;
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
