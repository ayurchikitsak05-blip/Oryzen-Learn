import { GoogleGenAI, Type } from "@google/genai";
import type {
  AiLensResponsePayload,
  GatewayTaskType,
  GeminiModelTier,
  TestMeMcqItem,
} from "./gateway";
import type {
  AnalogySections,
  ExplainSections,
  IllustrativeBundle,
  RevisionSections,
  ShortAnswerItem,
  StorySections,
  StudyDiagram,
  StudyDiagramEdge,
  StudyDiagramKind,
  StudyDiagramNode,
} from "./lens-compose";
import { isDisplayableModelText } from "./lens-compose";
import { requiredFieldsForLens } from "./lens-schema";
import {
  explanationsAreDistinct,
  filterRevisionTable,
  isEducationallyEmptyLabel,
  isGenericExplainTemplate,
  isGenericStudyStory,
} from "./lens-quality";

export const GEMINI_CALL_TIMEOUT_MS = 20_000;
export const GEMINI_MAX_ATTEMPTS = 2;

export type GeminiErrorClass =
  | "missing_key"
  | "billing"
  | "quota"
  | "auth"
  | "timeout"
  | "safety"
  | "unusable_output"
  | "unknown";

export function hasUsableGeminiKey(
  value = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY
): boolean {
  return Boolean(value?.trim());
}

export function classifyGeminiError(error: unknown): GeminiErrorClass {
  const text =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === "string"
        ? error
        : "unknown";
  const compact = text.toLowerCase();
  if (/abort|timeout|timed out/i.test(compact)) return "timeout";
  if (/quota|resource.?exhausted|rate.?limit|429/.test(compact)) return "quota";
  if (/billing|payment|customer.?to.?enable|activate.?billing/.test(compact)) {
    return "billing";
  }
  if (/api.?key|permission|unauthorized|forbidden|401|403/.test(compact)) {
    return "auth";
  }
  if (/safety|blocked|prohibited/.test(compact)) return "safety";
  return "unknown";
}

const stringSchema = { type: Type.STRING };
const stringArraySchema = {
  type: Type.ARRAY,
  items: stringSchema,
};

const diagramSchema = {
  type: Type.OBJECT,
  properties: {
    title: stringSchema,
    kind: stringSchema,
    nodes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: stringSchema,
          label: stringSchema,
        },
        required: ["id", "label"],
      },
    },
    edges: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          from: stringSchema,
          to: stringSchema,
          label: stringSchema,
        },
        required: ["from", "to"],
      },
    },
  },
  required: ["title", "nodes", "edges"],
};

export const LENS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    title: stringSchema,
    markdown_body: stringSchema,
    key_points: stringArraySchema,
    explain: {
      type: Type.OBJECT,
      properties: {
        simpleExplanation: stringSchema,
        standardExplanation: stringSchema,
        deeperExplanation: stringSchema,
        importantConcepts: stringArraySchema,
        relevantExample: stringSchema,
        keyTakeaway: stringSchema,
      },
      required: [
        "simpleExplanation",
        "standardExplanation",
        "deeperExplanation",
        "importantConcepts",
        "relevantExample",
        "keyTakeaway",
      ],
    },
    story: {
      type: Type.OBJECT,
      properties: {
        opening: stringSchema,
        turningPoint: stringSchema,
        close: stringSchema,
      },
      required: ["opening", "turningPoint", "close"],
    },
    revision: {
      type: Type.OBJECT,
      properties: {
        quickSummary: stringSchema,
        keyPoints: stringArraySchema,
        revisionTable: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              topic: stringSchema,
              remember: stringSchema,
            },
            required: ["topic", "remember"],
          },
        },
        memoryAid: stringSchema,
        examPractice: stringArraySchema,
      },
      required: [
        "quickSummary",
        "keyPoints",
        "revisionTable",
        "memoryAid",
        "examPractice",
      ],
    },
    analogy: {
      type: Type.OBJECT,
      properties: {
        setup: stringSchema,
        mapping: stringSchema,
        takeaway: stringSchema,
      },
      required: ["setup", "mapping", "takeaway"],
    },
    diagram: diagramSchema,
    illustrative: {
      type: Type.OBJECT,
      properties: {
        flowchart: diagramSchema,
        mindMap: diagramSchema,
        conceptDiagram: diagramSchema,
        analogy: {
          type: Type.OBJECT,
          properties: {
            setup: stringSchema,
            mapping: stringSchema,
            takeaway: stringSchema,
          },
          required: ["setup", "mapping", "takeaway"],
        },
      },
      required: ["flowchart", "mindMap", "conceptDiagram", "analogy"],
    },
    mcqs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          question: stringSchema,
          options: {
            type: Type.ARRAY,
            items: stringSchema,
          },
          correctIndex: { type: Type.INTEGER },
          explanation: stringSchema,
          citationLabel: stringSchema,
        },
        required: ["question", "options", "correctIndex", "explanation"],
      },
    },
    short_answers: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          prompt: stringSchema,
          expectedPoints: stringArraySchema,
          sampleAnswer: stringSchema,
        },
        required: ["prompt", "sampleAnswer"],
      },
    },
    askMyBook: {
      type: Type.OBJECT,
      properties: {
        question: stringSchema,
        answer: stringSchema,
        sufficientSource: { type: Type.BOOLEAN },
      },
      required: ["question", "answer", "sufficientSource"],
    },
  },
  required: ["title", "markdown_body", "key_points"],
};

function asCleanString(value: unknown, max = 800): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed.length < 2) return null;
  return trimmed.slice(0, max);
}

function asStringList(value: unknown, maxItems = 8, maxChars = 180): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asCleanString(item, maxChars))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function asDiagramKind(value: unknown, fallback: StudyDiagramKind): StudyDiagramKind {
  if (value === "flowchart" || value === "mind_map" || value === "concept_diagram") {
    return value;
  }
  return fallback;
}

function asDiagram(value: unknown, fallbackKind: StudyDiagramKind): StudyDiagram | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const nodes: StudyDiagramNode[] = Array.isArray(raw.nodes)
    ? raw.nodes
        .map((node, index) => {
          if (!node || typeof node !== "object") return null;
          const item = node as Record<string, unknown>;
          const id = asCleanString(item.id, 32) ?? `n${index}`;
          const label = asCleanString(item.label, 80);
          if (!label || isEducationallyEmptyLabel(label)) return null;
          return { id, label };
        })
        .filter((node): node is StudyDiagramNode => Boolean(node))
        .slice(0, 6)
    : [];
  if (nodes.length < 2) return null;
  const ids = new Set(nodes.map((node) => node.id));
  const edges: StudyDiagramEdge[] = Array.isArray(raw.edges)
    ? raw.edges
        .map((edge) => {
          if (!edge || typeof edge !== "object") return null;
          const item = edge as Record<string, unknown>;
          const from = asCleanString(item.from, 32);
          const to = asCleanString(item.to, 32);
          if (!from || !to || !ids.has(from) || !ids.has(to) || from === to) {
            return null;
          }
          const label = asCleanString(item.label, 24) ?? undefined;
          return { from, to, ...(label ? { label } : {}) };
        })
        .filter((edge): edge is StudyDiagramEdge => Boolean(edge))
        .slice(0, 8)
    : [];
  if (edges.length < 1) return null;
  return {
    title: asCleanString(raw.title, 80) ?? "Passage diagram",
    kind: asDiagramKind(raw.kind, fallbackKind),
    nodes,
    edges,
  };
}

function asExplain(value: unknown): ExplainSections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const simpleExplanation = asCleanString(raw.simpleExplanation, 900);
  const standardExplanation = asCleanString(raw.standardExplanation, 1200);
  const deeperExplanation = asCleanString(raw.deeperExplanation, 1400);
  const keyTakeaway = asCleanString(raw.keyTakeaway, 280);
  const relevantExample = asCleanString(raw.relevantExample, 400);
  const importantConcepts = asStringList(raw.importantConcepts, 4, 120);
  if (!simpleExplanation || !standardExplanation || !deeperExplanation || !keyTakeaway) {
    return null;
  }
  if (!explanationsAreDistinct(simpleExplanation, standardExplanation, deeperExplanation)) {
    return null;
  }
  if (
    isGenericExplainTemplate(
      `${simpleExplanation} ${standardExplanation} ${deeperExplanation}`
    )
  ) {
    return null;
  }
  return {
    simpleExplanation,
    standardExplanation,
    deeperExplanation,
    importantConcepts:
      importantConcepts.length > 0 ? importantConcepts : [keyTakeaway],
    relevantExample: relevantExample ?? keyTakeaway,
    keyTakeaway,
  };
}

function explainFromLabeledMarkdown(markdown: string): ExplainSections | null {
  const match = markdown.match(
    /simple(?:\s+explanation)?\s*[:.]?\s*([\s\S]+?)\s*(?:#{1,3}\s*)?standard(?:\s+explanation)?\s*[:.]?\s*([\s\S]+?)\s*(?:#{1,3}\s*)?deeper(?:\s+explanation)?\s*[:.]?\s*([\s\S]+)/i
  );
  if (!match) return null;
  const firstSentence = (value: string) => value.split(/(?<=\.)\s/)[0]?.trim() || value.trim();
  return asExplain({
    simpleExplanation: match[1],
    standardExplanation: match[2],
    deeperExplanation: match[3],
    importantConcepts: [],
    relevantExample: firstSentence(match[1]),
    keyTakeaway: firstSentence(match[2]),
  });
}

function asStory(value: unknown): StorySections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const opening = asCleanString(raw.opening, 400);
  const turningPoint = asCleanString(raw.turningPoint, 400);
  const close = asCleanString(raw.close, 400);
  if (!opening || !turningPoint || !close) return null;
  if (isGenericStudyStory(`${opening} ${turningPoint} ${close}`)) return null;
  return { opening, turningPoint, close };
}

function asRevision(value: unknown): RevisionSections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const quickSummary = asCleanString(raw.quickSummary, 320);
  const memoryAid = asCleanString(raw.memoryAid, 280);
  const keyPoints = asStringList(raw.keyPoints, 6, 160);
  const examPractice = asStringList(raw.examPractice, 4, 180);
  const revisionTable = Array.isArray(raw.revisionTable)
    ? raw.revisionTable
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const item = row as Record<string, unknown>;
          const topic = asCleanString(item.topic, 40);
          const remember = asCleanString(item.remember, 180);
          return topic && remember ? { topic, remember } : null;
        })
        .filter((row): row is { topic: string; remember: string } => Boolean(row))
        .slice(0, 6)
    : [];
  const cleanedTable = filterRevisionTable(revisionTable);
  const cleanedPoints = keyPoints.filter((item) => item.trim().split(/\s+/).length >= 2);
  if (!quickSummary || cleanedPoints.length < 1 || cleanedTable.length < 2) return null;
  return {
    quickSummary,
    keyPoints: cleanedPoints,
    revisionTable: cleanedTable,
    memoryAid: memoryAid ?? "",
    examPractice,
  };
}

function asAskAnswer(value: unknown, max = 2400): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (trimmed.length < 2) return null;
  return trimmed.slice(0, max);
}

function asAskMyBook(
  value: unknown
): { question: string; answer: string; sufficientSource: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const question = asCleanString(raw.question, 280);
  const answer = asAskAnswer(raw.answer, 2400);
  if (!question || !answer) return null;
  const sufficient =
    raw.sufficientSource === true ||
    (raw.sufficientSource !== false &&
      !/not give enough evidence|insufficient source/i.test(answer));
  return { question, answer, sufficientSource: sufficient };
}

function asAnalogy(value: unknown): AnalogySections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const setup = asCleanString(raw.setup, 280);
  const mapping = asCleanString(raw.mapping, 320);
  const takeaway = asCleanString(raw.takeaway, 240);
  if (!setup || !mapping || !takeaway) return null;
  return { setup, mapping, takeaway };
}

function asMcqs(value: unknown, fallbackLabel: string): TestMeMcqItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const question = asCleanString(raw.question, 240);
      const explanation = asCleanString(raw.explanation, 280);
      const options = asStringList(raw.options, 4, 140);
      const correctIndex = Number(raw.correctIndex);
      if (!question || !explanation || options.length !== 4) return null;
      if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex > 3) {
        return null;
      }
      return {
        question,
        options: [options[0], options[1], options[2], options[3]] as [
          string,
          string,
          string,
          string,
        ],
        correctIndex,
        explanation,
        citationLabel: asCleanString(raw.citationLabel, 40) ?? fallbackLabel,
      };
    })
    .filter((item): item is TestMeMcqItem => Boolean(item))
    .slice(0, 8);
}

function asShortAnswers(value: unknown): ShortAnswerItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      const prompt = asCleanString(raw.prompt, 240);
      const sampleAnswer = asCleanString(raw.sampleAnswer, 320);
      if (!prompt || !sampleAnswer) return null;
      return {
        prompt,
        expectedPoints: asStringList(raw.expectedPoints, 4, 80),
        sampleAnswer,
      };
    })
    .filter((item): item is ShortAnswerItem => Boolean(item))
    .slice(0, 3);
}

function asIllustrative(value: unknown): IllustrativeBundle | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const flowchart = asDiagram(raw.flowchart, "flowchart");
  const mindMap = asDiagram(raw.mindMap, "mind_map");
  const conceptDiagram = asDiagram(raw.conceptDiagram, "concept_diagram");
  const analogy = asAnalogy(raw.analogy);
  if (!flowchart && !mindMap && !conceptDiagram && !analogy) return null;
  return {
    ...(flowchart ? { flowchart: { ...flowchart, kind: "flowchart" as const } } : {}),
    ...(mindMap ? { mindMap: { ...mindMap, kind: "mind_map" as const } } : {}),
    ...(conceptDiagram
      ? { conceptDiagram: { ...conceptDiagram, kind: "concept_diagram" as const } }
      : {}),
    ...(analogy ? { analogy } : {}),
  };
}

function modeNeeds(lens: GatewayTaskType): string[] {
  return requiredFieldsForLens(lens).filter(
    (field) => field !== "title" && field !== "markdown_body" && field !== "key_points"
  );
}

export function mergeStructuredLensPayload(
  fallback: AiLensResponsePayload,
  raw: unknown,
  lensType: GatewayTaskType = fallback.lens_type
): { payload: AiLensResponsePayload; usable: boolean; missingStructure: string[] } {
  if (!raw || typeof raw !== "object") {
    return { payload: fallback, usable: false, missingStructure: [] };
  }
  const parsed = raw as Record<string, unknown>;
  const modelMarkdown = asCleanString(parsed.markdown_body, 4000);
  const markdown = modelMarkdown && isDisplayableModelText(modelMarkdown) ? modelMarkdown : "";
  const modelCitations = Array.isArray(parsed.citations)
    ? parsed.citations.filter(
        (item): item is AiLensResponsePayload["citations"][number] =>
          Boolean(item) &&
          typeof item === "object" &&
          typeof (item as { label?: unknown }).label === "string"
      )
    : [];
  const title = asCleanString(parsed.title, 80) ?? fallback.title;
  const keyPoints = asStringList(parsed.key_points, 8, 180);
  const explain =
    asExplain(parsed.explain) ??
    (lensType === "explain" || lensType === "deep_integrative_synthesis"
      ? explainFromLabeledMarkdown(markdown)
      : null);
  const story = asStory(parsed.story);
  const revision = asRevision(parsed.revision);
  const diagram = asDiagram(parsed.diagram, "flowchart");
  const illustrative = asIllustrative(parsed.illustrative);
  const mcqs = asMcqs(parsed.mcqs, fallback.citations[0]?.label ?? "[Page]");
  const shortAnswers = asShortAnswers(parsed.short_answers);
  const analogy = asAnalogy(parsed.analogy) ?? illustrative?.analogy ?? null;
  const askMyBook = asAskMyBook(parsed.askMyBook);

  const present = {
    explain: Boolean(explain),
    illustrative: Boolean(
      illustrative?.flowchart || illustrative?.mindMap || illustrative?.conceptDiagram
    ),
    story: Boolean(story),
    revision: Boolean(revision),
    mcqs: mcqs.length > 0,
    askMyBook: Boolean(askMyBook?.answer),
  };
  const missingStructure = modeNeeds(lensType).filter(
    (field) => !present[field as keyof typeof present]
  );
  const hasModelTeaching = Boolean(
    markdown || explain || story || revision || illustrative || diagram || askMyBook || mcqs.length > 0
  );
  if (!hasModelTeaching) {
    return { payload: fallback, usable: false, missingStructure: [] };
  }

  return {
    usable: true,
    missingStructure,
    payload: {
      lens_type: lensType,
      prakriti_dosha: fallback.prakriti_dosha,
      title,
      markdown_body: markdown,
      key_points: keyPoints,
      citations: modelCitations.length > 0 ? modelCitations : fallback.citations,
      ...(explain ? { explain } : {}),
      ...(story ? { story } : {}),
      ...(revision ? { revision } : {}),
      ...(diagram ? { diagram } : illustrative?.flowchart ? { diagram: illustrative.flowchart } : {}),
      ...(illustrative ? { illustrative } : {}),
      ...(analogy ? { analogy } : {}),
      ...(mcqs.length > 0 ? { mcqs } : {}),
      ...(shortAnswers.length > 0 ? { short_answers: shortAnswers } : {}),
      ...(askMyBook ? { askMyBook } : {}),
      used_fallback: false,
      missingStructure,
    },
  };
}

async function withTimeout<T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("timeout");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateStructuredGeminiLens(params: {
  model: GeminiModelTier;
  prompt: string;
  fallback: AiLensResponsePayload;
  lensType?: GatewayTaskType;
}): Promise<{
  payload: AiLensResponsePayload;
  promptTokens?: number;
  completionTokens?: number;
  errorClass: GeminiErrorClass | null;
}> {
  if (!hasUsableGeminiKey()) {
    return { payload: params.fallback, errorClass: "missing_key" };
  }

  let lastClass: GeminiErrorClass = "unknown";
  for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await withTimeout(GEMINI_CALL_TIMEOUT_MS, (signal) =>
        ai.models.generateContent({
          model: params.model,
          contents: params.prompt,
          config: {
            abortSignal: signal,
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              ...LENS_RESPONSE_SCHEMA,
              required: requiredFieldsForLens(params.lensType ?? "explain"),
            },
          },
        })
      );
      const usage = response.usageMetadata as
        | {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
            thoughtsTokenCount?: number;
          }
        | undefined;
      const text = response.text?.trim() ?? "";
      const parsed = text
        ? (JSON.parse(text) as unknown)
        : ((response as { parsed?: unknown }).parsed ?? null);
      const merged = mergeStructuredLensPayload(params.fallback, parsed, params.lensType);
      if (!merged.usable) {
        lastClass = "unusable_output";
        continue;
      }
      return {
        payload: merged.payload,
        promptTokens: usage?.promptTokenCount,
        completionTokens:
          typeof usage?.candidatesTokenCount === "number"
            ? usage.candidatesTokenCount + (usage.thoughtsTokenCount ?? 0)
            : undefined,
        errorClass: null,
      };
    } catch (error) {
      lastClass = classifyGeminiError(error);
      if (
        lastClass === "billing" ||
        lastClass === "quota" ||
        lastClass === "auth" ||
        lastClass === "safety"
      ) {
        break;
      }
    }
  }

  return { payload: params.fallback, errorClass: lastClass };
}
