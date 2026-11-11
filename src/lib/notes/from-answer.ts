/**
 * Saving an AI answer the student already has as a formatted note. Uses the answer that is
 * on screen; never asks the AI again, so it costs nothing.
 */
import type { AiLensResponsePayload } from "@/lib/ai/gateway";
import type { StudyDiagram } from "@/lib/ai/lens-compose";
import type { FormattedNote, NoteFormat, OutlineItem } from "./formats";

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

/** Steps in order: start from a node nothing points to, follow the arrows. */
export function diagramAsSteps(diagram: StudyDiagram): string[] {
  const labels = new Map(diagram.nodes.map((node) => [node.id, clean(node.label)]));
  const incoming = new Set(diagram.edges.map((edge) => edge.to));
  const next = new Map<string, string[]>();
  for (const edge of diagram.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !labels.has(id)) return;
    seen.add(id);
    order.push(id);
    for (const to of next.get(id) ?? []) visit(to);
  };
  for (const node of diagram.nodes) if (!incoming.has(node.id)) visit(node.id);
  for (const node of diagram.nodes) visit(node.id);
  return order.map((id) => labels.get(id) ?? "").filter(Boolean).slice(0, 30);
}

/** Branches under the centre: the centre's children, then their children. */
export function diagramAsBranches(diagram: StudyDiagram): OutlineItem[] {
  const labels = new Map(diagram.nodes.map((node) => [node.id, clean(node.label)]));
  const incoming = new Set(diagram.edges.map((edge) => edge.to));
  const children = (id: string) => diagram.edges.filter((edge) => edge.from === id).map((edge) => edge.to);
  const root = diagram.nodes.find((node) => !incoming.has(node.id))?.id ?? diagram.nodes[0]?.id;
  if (!root) return [];
  const items: OutlineItem[] = [];
  const seen = new Set<string>([root]);
  for (const branch of children(root)) {
    if (seen.has(branch)) continue;
    seen.add(branch);
    items.push({ level: 0, text: labels.get(branch) ?? "" });
    for (const leaf of children(branch)) {
      if (seen.has(leaf)) continue;
      seen.add(leaf);
      items.push({ level: 1, text: labels.get(leaf) ?? "" });
    }
  }
  return items.filter((item) => item.text).slice(0, 40);
}

export interface AnswerNoteOption {
  format: NoteFormat;
  label: string;
  note: FormattedNote;
}

/** The formats this answer can be saved in. */
export function noteOptionsForAnswer(payload: AiLensResponsePayload): AnswerNoteOption[] {
  const options: AnswerNoteOption[] = [];
  const flow =
    payload.illustrative?.flowchart ??
    (payload.diagram && payload.diagram.kind !== "mind_map" ? payload.diagram : undefined);
  if (flow && flow.nodes.length >= 2) {
    options.push({ format: "flowchart", label: "Flowchart", note: { format: "flowchart", steps: diagramAsSteps(flow) } });
  }
  const mind = payload.illustrative?.mindMap ?? (payload.diagram?.kind === "mind_map" ? payload.diagram : undefined);
  if (mind && mind.nodes.length >= 3) {
    const items = diagramAsBranches(mind);
    if (items.length) options.push({ format: "mindmap", label: "Mind map", note: { format: "mindmap", items } });
  }
  const table = (payload.revision?.revisionTable ?? []).filter((row) => clean(row.topic) && clean(row.remember));
  if (table.length >= 2) {
    options.push({
      format: "cornell",
      label: "Cornell (revision cards)",
      note: {
        format: "cornell",
        pairs: table.map((row) => ({ q: `${clean(row.topic)}?`, a: clean(row.remember) })),
        summary: clean(payload.revision?.quickSummary),
      },
    });
    options.push({
      format: "table",
      label: "Table",
      note: { format: "table", rows: [["Topic", "Remember"], ...table.map((row) => [clean(row.topic), clean(row.remember)])] },
    });
  }
  const points = (payload.revision?.keyPoints?.length ? payload.revision.keyPoints : payload.key_points ?? []).map(clean).filter(Boolean);
  if (points.length >= 2) {
    options.push({
      format: "outline",
      label: "Outline",
      note: { format: "outline", items: points.slice(0, 30).map((text) => ({ level: 1 as const, text })) },
    });
  }
  return options;
}
