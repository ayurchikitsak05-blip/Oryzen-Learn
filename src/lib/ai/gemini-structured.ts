import { GoogleGenAI, Type } from "@google/genai";
import type {
  AiLensResponsePayload,
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
import { isUsableModelText } from "./lens-compose";

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
          const label = asCleanString(item.label, 64);
          return label ? { id, label } : null;
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
  const simpleExplanation = asCleanString(raw.simpleExplanation, 600);
  const standardExplanation = asCleanString(raw.standardExplanation, 800);
  const deeperExplanation = asCleanString(raw.deeperExplanation, 1000);
  const keyTakeaway = asCleanString(raw.keyTakeaway, 280);
  const relevantExample = asCleanString(raw.relevantExample, 280);
  const importantConcepts = asStringList(raw.importantConcepts, 4, 80);
  if (!simpleExplanation || !standardExplanation || !keyTakeaway) return null;
  return {
    simpleExplanation,
    standardExplanation,
    deeperExplanation: deeperExplanation ?? standardExplanation,
    importantConcepts:
      importantConcepts.length > 0 ? importantConcepts : [keyTakeaway],
    relevantExample: relevantExample ?? keyTakeaway,
    keyTakeaway,
  };
}

function asStory(value: unknown): StorySections | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const opening = asCleanString(raw.opening, 400);
  const turningPoint = asCleanString(raw.turningPoint, 400);
  const close = asCleanString(raw.close, 400);
  if (!opening || !turningPoint || !close) return null;
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
  if (!quickSummary || keyPoints.length < 1 || revisionTable.length < 2) return null;
  return {
    quickSummary,
    keyPoints,
    revisionTable,
    memoryAid: memoryAid ?? quickSummary,
    examPractice:
      examPractice.length > 0
        ? examPractice
        : ["Restate the main claim from these lines only."],
  };
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
    .slice(0, 4);
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
  if (!flowchart || !mindMap || !conceptDiagram || !analogy) return null;
  return {
    flowchart: { ...flowchart, kind: "flowchart" },
    mindMap: { ...mindMap, kind: "mind_map" },
    conceptDiagram: { ...conceptDiagram, kind: "concept_diagram" },
    analogy,
  };
}

export function mergeStructuredLensPayload(
  fallback: AiLensResponsePayload,
  raw: unknown
): { payload: AiLensResponsePayload; usable: boolean } {
  if (!raw || typeof raw !== "object") {
    return { payload: fallback, usable: false };
  }
  const parsed = raw as Record<string, unknown>;
  const markdown =
    asCleanString(parsed.markdown_body, 4000) ?? fallback.markdown_body;
  const title = asCleanString(parsed.title, 80) ?? fallback.title;
  const keyPoints = asStringList(parsed.key_points, 8, 160);
  const explain = asExplain(parsed.explain) ?? fallback.explain;
  const story = asStory(parsed.story) ?? fallback.story;
  const revision = asRevision(parsed.revision) ?? fallback.revision;
  const diagram = asDiagram(parsed.diagram, fallback.diagram?.kind ?? "flowchart");
  const illustrative = asIllustrative(parsed.illustrative) ?? fallback.illustrative;
  const mcqs = asMcqs(parsed.mcqs, fallback.citations[0]?.label ?? "[Page]");
  const shortAnswers = asShortAnswers(parsed.short_answers);
  const analogy = asAnalogy(parsed.analogy);

  const structuredOk = Boolean(
    explain ||
      story ||
      revision ||
      illustrative ||
      diagram ||
      mcqs.length > 0 ||
      isUsableModelText(markdown)
  );
  if (!structuredOk) {
    return { payload: fallback, usable: false };
  }

  return {
    usable: true,
    payload: {
      ...fallback,
      title,
      markdown_body: markdown,
      key_points: keyPoints.length > 0 ? keyPoints : fallback.key_points,
      explain,
      story,
      revision,
      diagram: diagram ?? illustrative?.flowchart ?? fallback.diagram,
      illustrative,
      analogy: analogy ?? illustrative?.analogy ?? fallback.analogy,
      mcqs: mcqs.length > 0 ? mcqs : fallback.mcqs,
      short_answers: shortAnswers.length > 0 ? shortAnswers : fallback.short_answers,
      used_fallback: false,
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
            responseSchema: LENS_RESPONSE_SCHEMA,
          },
        })
      );
      const usage = response.usageMetadata;
      const text = response.text?.trim() ?? "";
      const parsed = text
        ? (JSON.parse(text) as unknown)
        : ((response as { parsed?: unknown }).parsed ?? null);
      const merged = mergeStructuredLensPayload(params.fallback, parsed);
      if (!merged.usable) {
        lastClass = "unusable_output";
        continue;
      }
      return {
        payload: merged.payload,
        promptTokens: usage?.promptTokenCount,
        completionTokens: usage?.candidatesTokenCount,
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
