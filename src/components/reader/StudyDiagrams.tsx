"use client";

import React from "react";
import type { StudyDiagram, StudyRectangleGeometry } from "@/lib/ai/lens-compose";

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

function wrapLabel(label: string, maxChars = 16, maxLines = 2): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars) {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 1)}…` : word;
    } else {
      current = next;
    }
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

function ArrowMarker({ id }: { id: string }) {
  return (
    <marker
      id={id}
      markerWidth="8"
      markerHeight="8"
      refX="6"
      refY="4"
      orient="auto"
    >
      <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
    </marker>
  );
}

export function FlowchartSvg({ diagram }: { diagram: StudyDiagram }) {
  const nodes = diagram.nodes.slice(0, 6);
  if (nodes.length === 0 && !diagram.geometry) return null;
  const geometry =
    diagram.geometry?.kind === "rectangle" ? diagram.geometry : undefined;
  const width = Math.max(320, nodes.length * 168);
  const height = 188;
  const boxWidth = 138;
  const boxHeight = 64;
  const startX = 16;
  const y = 56;

  return (
    <div
      data-testid="study-flowchart"
      className="space-y-2 overflow-x-auto rounded-2xl border border-line bg-surface p-3"
      role="img"
      aria-label={diagram.title}
    >
      {geometry ? <RectangleGeometrySvg geometry={geometry} /> : null}
      {nodes.length > 0 ? (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full min-w-[18rem]">
        <defs>
          <ArrowMarker id="flow-arrow" />
        </defs>
        {nodes.map((node, index) => {
          const x = startX + index * 168;
          const next = nodes[index + 1];
          const lines = wrapLabel(node.label);
          const edge = diagram.edges.find(
            (item) => item.from === node.id && item.to === next?.id
          ) ?? diagram.edges[index];
          return (
            <g key={node.id}>
              <rect
                x={x}
                y={y}
                width={boxWidth}
                height={boxHeight}
                rx={14}
                fill="var(--beige-secondary)"
                stroke="var(--beige-primary)"
              />
              {lines.map((line, lineIndex) => (
                <text
                  key={`${node.id}-${line}`}
                  x={x + boxWidth / 2}
                  y={y + 26 + lineIndex * 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--heading)"
                >
                  {line}
                </text>
              ))}
              {next ? (
                <>
                  <line
                    x1={x + boxWidth}
                    y1={y + boxHeight / 2}
                    x2={x + 168}
                    y2={y + boxHeight / 2}
                    stroke="var(--accent)"
                    strokeWidth="2"
                    markerEnd="url(#flow-arrow)"
                  />
                  {edge?.label ? (
                    <text
                      x={x + boxWidth + 8}
                      y={y + 16}
                      fontSize="9"
                      fill="var(--text-secondary)"
                    >
                      {edge.label}
                    </text>
                  ) : null}
                </>
              ) : null}
            </g>
          );
        })}
      </svg>
      ) : null}
    </div>
  );
}

export function MindMapSvg({ diagram }: { diagram: StudyDiagram }) {
  const hub = diagram.nodes[0];
  const branches = diagram.nodes.slice(1, 5);
  if (!hub) return null;
  const width = 520;
  const height = 280;
  const cx = 260;
  const cy = 140;
  const radius = 96;
  const positions = branches.map((_, index) => {
    const angle = (-Math.PI / 2) + ((index + 0.5) * (Math.PI * 2)) / Math.max(branches.length, 1);
    return {
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * 78,
    };
  });

  return (
    <div
      data-testid="study-mind-map"
      className="overflow-x-auto rounded-2xl border border-line bg-surface p-3"
      role="img"
      aria-label={diagram.title}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full min-w-[20rem]">
        <defs>
          <ArrowMarker id="mind-arrow" />
        </defs>
        {branches.map((node, index) => {
          const pos = positions[index];
          return (
            <line
              key={`edge-${node.id}`}
              x1={cx}
              y1={cy}
              x2={pos.x}
              y2={pos.y}
              stroke="var(--accent)"
              strokeWidth="2"
            />
          );
        })}
        <circle cx={cx} cy={cy} r={46} fill="var(--selected)" stroke="var(--beige-primary)" />
        {wrapLabel(hub.label, 12).map((line, lineIndex) => (
          <text
            key={`hub-${line}`}
            x={cx}
            y={cy - 6 + lineIndex * 14}
            textAnchor="middle"
            fontSize="11"
            fill="var(--heading)"
          >
            {line}
          </text>
        ))}
        {branches.map((node, index) => {
          const pos = positions[index];
          const lines = wrapLabel(node.label, 14);
          return (
            <g key={node.id}>
              <rect
                x={pos.x - 62}
                y={pos.y - 24}
                width={124}
                height={48}
                rx={12}
                fill="var(--beige-secondary)"
                stroke="var(--beige-primary)"
              />
              {lines.map((line, lineIndex) => (
                <text
                  key={`${node.id}-${line}`}
                  x={pos.x}
                  y={pos.y - 4 + lineIndex * 14}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--heading)"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function ConceptDiagramSvg({ diagram }: { diagram: StudyDiagram }) {
  const nodes = diagram.nodes.slice(0, 4);
  const geometry =
    diagram.geometry?.kind === "rectangle" ? diagram.geometry : undefined;
  if (nodes.length === 0 && !geometry) return null;
  const width = 480;
  const height = 260;
  const slots = [
    { x: 40, y: 28 },
    { x: 280, y: 28 },
    { x: 40, y: 150 },
    { x: 280, y: 150 },
  ];
  const boxW = 160;
  const boxH = 70;
  const byId = new Map(nodes.map((node, index) => [node.id, slots[index]]));

  return (
    <div
      data-testid="study-concept-diagram"
      className="space-y-2 overflow-x-auto rounded-2xl border border-line bg-surface p-3"
      role="img"
      aria-label={diagram.title}
    >
      {geometry ? <RectangleGeometrySvg geometry={geometry} /> : null}
      <svg viewBox={`0 0 ${width} ${height}`} className="h-60 w-full min-w-[18rem]">
        <defs>
          <ArrowMarker id="concept-arrow" />
        </defs>
        {diagram.edges.map((edge, index) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + boxW / 2;
          const y1 = from.y + boxH / 2;
          const x2 = to.x + boxW / 2;
          const y2 = to.y + boxH / 2;
          return (
            <g key={`${edge.from}-${edge.to}-${index}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="var(--accent)"
                strokeWidth="2"
                markerEnd="url(#concept-arrow)"
              />
              {edge.label ? (
                <text
                  x={(x1 + x2) / 2}
                  y={(y1 + y2) / 2 - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--text-secondary)"
                >
                  {edge.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const slot = slots[index];
          const lines = wrapLabel(node.label, 16);
          return (
            <g key={node.id}>
              <rect
                x={slot.x}
                y={slot.y}
                width={boxW}
                height={boxH}
                rx={14}
                fill="var(--beige-secondary)"
                stroke="var(--beige-primary)"
              />
              {lines.map((line, lineIndex) => (
                <text
                  key={`${node.id}-${line}`}
                  x={slot.x + boxW / 2}
                  y={slot.y + 30 + lineIndex * 16}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--heading)"
                >
                  {line}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
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
