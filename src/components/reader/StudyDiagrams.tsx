"use client";

import React from "react";
import type { StudyDiagram, StudyDiagramEdge, StudyRectangleGeometry } from "@/lib/ai/lens-compose";

export function RectangleGeometrySvg({
  geometry,
}: {
  geometry: StudyRectangleGeometry;
}) {
  const maxW = 280;
  const maxH = 150;
  const aspect = geometry.length / Math.max(0.25, geometry.width);
  let w = maxW;
  let h = w / aspect;
  if (h > maxH) {
    h = maxH;
    w = h * aspect;
  }
  const left = 36;
  const top = 28;
  const svgW = left + w + 88;
  const svgH = top + h + 36;

  return (
    <div
      data-testid="study-rectangle-geometry"
      className="overflow-x-auto rounded-2xl border border-line bg-surface p-3"
      role="img"
      aria-label={`${geometry.lengthLabel}, ${geometry.widthLabel}, ${geometry.areaLabel}`}
    >
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="h-48 w-full min-w-[16rem]">
        <rect
          x={left}
          y={top}
          width={w}
          height={h}
          rx={4}
          fill="var(--selected)"
          stroke="var(--beige-primary)"
          strokeWidth="2"
        />
        <text
          x={left + w / 2}
          y={top - 8}
          textAnchor="middle"
          fontSize="12"
          fill="var(--heading)"
        >
          {geometry.lengthLabel}
        </text>
        <text
          x={left + w + 8}
          y={top + h / 2}
          fontSize="12"
          fill="var(--heading)"
        >
          {geometry.widthLabel}
        </text>
        <text
          x={left + w / 2}
          y={top + h / 2 + 4}
          textAnchor="middle"
          fontSize="13"
          fill="var(--heading)"
        >
          {geometry.areaLabel}
        </text>
      </svg>
    </div>
  );
}

function DiagramFrame({
  testId,
  title,
  children,
}: {
  testId: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      role="group"
      aria-label={title}
      className="space-y-3 rounded-2xl border border-line bg-surface p-3"
    >
      <p className="text-sm font-medium text-heading">{title}</p>
      {children}
    </div>
  );
}

function PhraseCard({ label }: { label: string }) {
  return (
    <p className="rounded-2xl border border-line bg-beige-2 px-3 py-3 text-sm leading-snug text-heading">
      {label}
    </p>
  );
}

function RelationArrow({ label }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 px-1 text-sm leading-snug text-ink">
      <span aria-hidden="true" className="text-base text-accent">
        ↓
      </span>
      {label ? <span>{label}</span> : null}
    </p>
  );
}

export function FlowchartSvg({ diagram }: { diagram: StudyDiagram }) {
  const nodes = diagram.nodes.slice(0, 12);
  const geometry =
    diagram.geometry?.kind === "rectangle" ? diagram.geometry : undefined;
  if (nodes.length === 0 && !geometry) return null;
  const byId = new Map(nodes.map((node) => [node.id, node.label]));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, StudyDiagramEdge[]>();
  const usable: StudyDiagramEdge[] = diagram.edges.filter(
    (edge) => byId.has(edge.from) && byId.has(edge.to)
  );
  for (const edge of usable) {
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
  }
  const used = new Set<StudyDiagramEdge>();
  const chains: StudyDiagramEdge[][] = [];
  for (const edge of usable) {
    if (used.has(edge) || (incoming.get(edge.from) ?? 0) > 0) continue;
    const chain: StudyDiagramEdge[] = [];
    let current: StudyDiagramEdge | undefined = edge;
    while (current && !used.has(current)) {
      used.add(current);
      chain.push(current);
      const nextEdges: StudyDiagramEdge[] = outgoing.get(current.to) ?? [];
      current =
        nextEdges.length === 1 && (incoming.get(current.to) ?? 0) === 1
          ? nextEdges[0]
          : undefined;
    }
    if (chain.length > 0) chains.push(chain);
  }
  for (const edge of usable) {
    if (!used.has(edge)) chains.push([edge]);
  }
  const covered = new Set(usable.flatMap((edge) => [edge.from, edge.to]));
  const loose = nodes.filter((node) => !covered.has(node.id));

  return (
    <DiagramFrame testId="study-flowchart" title={diagram.title}>
      {geometry ? <RectangleGeometrySvg geometry={geometry} /> : null}
      <ol className="space-y-3">
        {chains.map((chain, index) => {
          const first = byId.get(chain[0]?.from ?? "");
          if (!first) return null;
          return (
            <li key={`${chain[0]?.from}-${index}`} className="space-y-2">
              <PhraseCard label={first} />
              {chain.map((edge) => {
                const next = byId.get(edge.to);
                if (!next) return null;
                return (
                  <div key={`${edge.from}-${edge.to}-${edge.label}`} className="space-y-2">
                    <RelationArrow label={edge.label} />
                    <PhraseCard label={next} />
                  </div>
                );
              })}
            </li>
          );
        })}
        {loose.map((node) => (
          <li key={node.id}>
            <PhraseCard label={node.label} />
          </li>
        ))}
      </ol>
    </DiagramFrame>
  );
}

export function MindMapSvg({ diagram }: { diagram: StudyDiagram }) {
  const hub = diagram.nodes[0];
  const branches = diagram.nodes.slice(1, 6);
  if (!hub) return null;
  const links = branches.map((node) => {
    const outgoing = diagram.edges.find((item) => item.from === hub.id && item.to === node.id);
    const incoming = diagram.edges.find((item) => item.from === node.id && item.to === hub.id);
    const related =
      outgoing ??
      incoming ??
      diagram.edges.find((item) => item.to === node.id || item.from === node.id);
    return { node, outgoing, incoming, label: related?.label };
  });
  const hubIsSource = links.every((link) => !link.incoming);

  return (
    <DiagramFrame testId="study-mind-map" title={diagram.title}>
      {hubIsSource ? (
        <ul className="space-y-3">
          {links.map((link) => (
            <li key={link.node.id} className="space-y-2">
              <PhraseCard label={hub.label} />
              <RelationArrow label={link.label} />
              <PhraseCard label={link.node.label} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="space-y-3">
          {links.map((link) => {
            const sourceFirst = Boolean(link.incoming && !link.outgoing);
            return (
              <li key={link.node.id} className="space-y-2">
                <PhraseCard label={sourceFirst ? link.node.label : hub.label} />
                <RelationArrow label={link.label} />
                <PhraseCard label={sourceFirst ? hub.label : link.node.label} />
              </li>
            );
          })}
        </ul>
      )}
    </DiagramFrame>
  );
}

export function ConceptDiagramSvg({ diagram }: { diagram: StudyDiagram }) {
  const nodes = diagram.nodes.slice(0, 6);
  const geometry =
    diagram.geometry?.kind === "rectangle" ? diagram.geometry : undefined;
  if (nodes.length === 0 && !geometry) return null;
  const byId = new Map(nodes.map((node) => [node.id, node.label]));

  return (
    <DiagramFrame testId="study-concept-diagram" title={diagram.title}>
      {geometry ? <RectangleGeometrySvg geometry={geometry} /> : null}
      <ul className="space-y-3">
        {diagram.edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <li key={`${edge.from}-${edge.to}-${index}`} className="space-y-2">
              <PhraseCard label={from} />
              <RelationArrow label={edge.label} />
              <PhraseCard label={to} />
            </li>
          );
        })}
      </ul>
    </DiagramFrame>
  );
}

export function StudyDiagramView({
  diagram,
}: {
  diagram: StudyDiagram;
}) {
  if (diagram.kind === "mind_map") return <MindMapSvg diagram={diagram} />;
  if (diagram.kind === "concept_diagram") return <ConceptDiagramSvg diagram={diagram} />;
  return <FlowchartSvg diagram={diagram} />;
}
