import type { GatewayTaskType } from "./gateway";

const STRING = { type: "STRING" as const };
const STRING_ARRAY = { type: "ARRAY" as const, items: STRING };

const diagramRest = {
  type: "OBJECT" as const,
  properties: {
    title: STRING,
    kind: STRING,
    nodes: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: { id: STRING, label: STRING },
        required: ["id", "label"],
      },
    },
    edges: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: { from: STRING, to: STRING, label: STRING },
        required: ["from", "to"],
      },
    },
  },
  required: ["title", "nodes", "edges"],
};

const explainRest = {
  type: "OBJECT" as const,
  properties: {
    simpleExplanation: STRING,
    standardExplanation: STRING,
    deeperExplanation: STRING,
    importantConcepts: STRING_ARRAY,
    relevantExample: STRING,
    keyTakeaway: STRING,
  },
  required: [
    "simpleExplanation",
    "standardExplanation",
    "deeperExplanation",
    "importantConcepts",
    "relevantExample",
    "keyTakeaway",
  ],
};

const storyRest = {
  type: "OBJECT" as const,
  properties: {
    opening: STRING,
    turningPoint: STRING,
    close: STRING,
  },
  required: ["opening", "turningPoint", "close"],
};

const revisionRest = {
  type: "OBJECT" as const,
  properties: {
    quickSummary: STRING,
    keyPoints: STRING_ARRAY,
    revisionTable: {
      type: "ARRAY" as const,
      items: {
        type: "OBJECT" as const,
        properties: { topic: STRING, remember: STRING },
        required: ["topic", "remember"],
      },
    },
    memoryAid: STRING,
    examPractice: STRING_ARRAY,
  },
  required: ["quickSummary", "keyPoints", "revisionTable", "memoryAid", "examPractice"],
};

const analogyRest = {
  type: "OBJECT" as const,
  properties: { setup: STRING, mapping: STRING, takeaway: STRING },
  required: ["setup", "mapping", "takeaway"],
};

const illustrativeRest = {
  type: "OBJECT" as const,
  properties: {
    flowchart: diagramRest,
    mindMap: diagramRest,
    conceptDiagram: diagramRest,
    analogy: analogyRest,
  },
  required: ["flowchart", "mindMap", "conceptDiagram"],
};

const mcqRest = {
  type: "ARRAY" as const,
  items: {
    type: "OBJECT" as const,
    properties: {
      question: STRING,
      options: STRING_ARRAY,
      correctIndex: { type: "INTEGER" as const },
      explanation: STRING,
      citationLabel: STRING,
    },
    required: ["question", "options", "correctIndex", "explanation"],
  },
};

const askRest = {
  type: "OBJECT" as const,
  properties: {
    question: STRING,
    answer: STRING,
    sufficientSource: { type: "BOOLEAN" as const },
  },
  required: ["question", "answer", "sufficientSource"],
};

function restProperties(lens: GatewayTaskType | "markdown") {
  const base = {
    title: STRING,
    markdown_body: STRING,
    key_points: STRING_ARRAY,
  };
  if (lens === "explain" || lens === "deep_integrative_synthesis") {
    return { ...base, explain: explainRest };
  }
  if (lens === "illustrative") return { ...base, illustrative: illustrativeRest };
  if (lens === "story") return { ...base, story: storyRest };
  if (lens === "high_yield_revision") return { ...base, revision: revisionRest };
  if (lens === "test_me") return { ...base, mcqs: mcqRest };
  if (lens === "ask_my_book") return { ...base, askMyBook: askRest };
  return base;
}

export function requiredFieldsForLens(lens: GatewayTaskType | "markdown"): string[] {
  const required = ["title", "markdown_body", "key_points"];
  if (lens === "explain" || lens === "deep_integrative_synthesis") required.push("explain");
  if (lens === "illustrative") required.push("illustrative");
  if (lens === "story") required.push("story");
  if (lens === "high_yield_revision") required.push("revision");
  if (lens === "test_me") required.push("mcqs");
  if (lens === "ask_my_book") required.push("askMyBook");
  return required;
}

export function geminiRestSchemaForLens(
  lens: GatewayTaskType | "markdown" = "markdown"
): Record<string, unknown> {
  return {
    type: "OBJECT",
    properties: restProperties(lens),
    required: requiredFieldsForLens(lens),
  };
}

function jsonString() {
  return { type: "string" };
}

function jsonDiagram() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      title: jsonString(),
      kind: jsonString(),
      nodes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { id: jsonString(), label: jsonString() },
          required: ["id", "label"],
        },
      },
      edges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: { from: jsonString(), to: jsonString(), label: jsonString() },
          required: ["from", "to"],
        },
      },
    },
    required: ["title", "nodes", "edges"],
  };
}

export function jsonSchemaForLens(lens: GatewayTaskType | "markdown" = "markdown") {
  const diagram = jsonDiagram();
  const properties: Record<string, unknown> = {
    title: jsonString(),
    markdown_body: jsonString(),
    key_points: { type: "array", items: jsonString() },
  };
  if (lens === "explain" || lens === "deep_integrative_synthesis") {
    properties.explain = {
      type: "object",
      additionalProperties: false,
      properties: {
        simpleExplanation: jsonString(),
        standardExplanation: jsonString(),
        deeperExplanation: jsonString(),
        importantConcepts: { type: "array", items: jsonString() },
        relevantExample: jsonString(),
        keyTakeaway: jsonString(),
      },
      required: [
        "simpleExplanation",
        "standardExplanation",
        "deeperExplanation",
        "importantConcepts",
        "relevantExample",
        "keyTakeaway",
      ],
    };
  }
  if (lens === "illustrative") {
    properties.illustrative = {
      type: "object",
      additionalProperties: false,
      properties: {
        flowchart: diagram,
        mindMap: diagram,
        conceptDiagram: diagram,
        analogy: {
          type: "object",
          additionalProperties: false,
          properties: { setup: jsonString(), mapping: jsonString(), takeaway: jsonString() },
          required: ["setup", "mapping", "takeaway"],
        },
      },
      required: ["flowchart", "mindMap", "conceptDiagram"],
    };
  }
  if (lens === "story") {
    properties.story = {
      type: "object",
      additionalProperties: false,
      properties: { opening: jsonString(), turningPoint: jsonString(), close: jsonString() },
      required: ["opening", "turningPoint", "close"],
    };
  }
  if (lens === "high_yield_revision") {
    properties.revision = {
      type: "object",
      additionalProperties: false,
      properties: {
        quickSummary: jsonString(),
        keyPoints: { type: "array", items: jsonString() },
        revisionTable: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { topic: jsonString(), remember: jsonString() },
            required: ["topic", "remember"],
          },
        },
        memoryAid: jsonString(),
        examPractice: { type: "array", items: jsonString() },
      },
      required: ["quickSummary", "keyPoints", "revisionTable", "memoryAid", "examPractice"],
    };
  }
  if (lens === "test_me") {
    properties.mcqs = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          question: jsonString(),
          options: { type: "array", items: jsonString() },
          correctIndex: { type: "integer" },
          explanation: jsonString(),
          citationLabel: jsonString(),
        },
        required: ["question", "options", "correctIndex", "explanation"],
      },
    };
  }
  if (lens === "ask_my_book") {
    properties.askMyBook = {
      type: "object",
      additionalProperties: false,
      properties: {
        question: jsonString(),
        answer: jsonString(),
        sufficientSource: { type: "boolean" },
      },
      required: ["question", "answer", "sufficientSource"],
    };
  }
  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: requiredFieldsForLens(lens),
  };
}
