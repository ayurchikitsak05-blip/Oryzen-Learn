"use client";

import React from "react";
import type { StudyDiagram } from "@/lib/ai/lens-compose";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__(.+?)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-beige px-1 py-0.5 text-[0.85em]">$1</code>');
}

function parseMermaidNodes(block: string): StudyDiagram | null {
  const labels = [...block.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1].trim());
  if (labels.length < 2) return null;
  const unique = labels.filter((label, index) => labels.indexOf(label) === index);
  return {
    title: "Passage flowchart",
    nodes: unique.map((label, index) => ({
      id: `n${index}`,
      label,
    })),
    edges: unique.slice(0, -1).map((_, index) => ({
      from: `n${index}`,
      to: `n${index + 1}`,
    })),
  };
}

export function StudyFlowchart({
  diagram,
}: {
  diagram: StudyDiagram;
}) {
  const nodes = diagram.nodes.slice(0, 6);
  if (nodes.length === 0) return null;
  const width = Math.max(320, nodes.length * 168);
  const height = 176;
  const boxWidth = 138;
  const boxHeight = 64;
  const startX = 16;
  const y = 52;

  const wrapLabel = (label: string) => {
    const words = label.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 16) {
        if (current) lines.push(current);
        current = word.length > 16 ? `${word.slice(0, 15)}…` : word;
      } else {
        current = next;
      }
      if (lines.length === 2) break;
    }
    if (current && lines.length < 2) lines.push(current);
    return lines.slice(0, 2);
  };

  return (
    <div
      data-testid="study-flowchart"
      className="overflow-x-auto rounded-2xl border border-line bg-surface p-3"
      role="img"
      aria-label={diagram.title}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-40 w-full min-w-[18rem]"
      >
        {nodes.map((node, index) => {
          const x = startX + index * 168;
          const next = nodes[index + 1];
          const lines = wrapLabel(node.label);
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
              {next && (
                <>
                  <line
                    x1={x + boxWidth}
                    y1={y + boxHeight / 2}
                    x2={x + 168}
                    y2={y + boxHeight / 2}
                    stroke="var(--accent)"
                    strokeWidth="2"
                    markerEnd="url(#study-arrow)"
                  />
                  {diagram.edges[index]?.label && (
                    <text
                      x={x + boxWidth + 8}
                      y={y + 16}
                      fontSize="9"
                      fill="var(--text-secondary)"
                    >
                      {diagram.edges[index]?.label}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
        <defs>
          <marker
            id="study-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" />
          </marker>
        </defs>
      </svg>
    </div>
  );
}

function renderTable(rows: string[]): React.ReactNode {
  const parsed = rows
    .map((row) =>
      row
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|")
        .map((cell) => cell.trim())
    )
    .filter((cells) => cells.some((cell) => cell.length > 0));
  if (parsed.length < 2) return null;
  const header = parsed[0];
  const body = parsed.slice(1).filter((cells) => !cells.every((cell) => /^:?-{3,}:?$/.test(cell)));
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr>
            {header.map((cell) => (
              <th
                key={cell}
                className="border-b border-line px-2 py-2 font-medium text-heading"
                dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((cells, index) => (
            <tr key={`${cells[0]}-${index}`}>
              {cells.map((cell, cellIndex) => (
                <td
                  key={`${cellIndex}-${cell}`}
                  className="border-b border-line px-2 py-2 text-ink"
                  dangerouslySetInnerHTML={{ __html: inlineMarkdown(cell) }}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StudyMarkdown({
  markdown,
  diagram,
}: {
  markdown: string;
  diagram?: StudyDiagram;
}) {
  const blocks = markdown.replace(/\r\n/g, "\n").split("\n");
  const nodes: React.ReactNode[] = [];
  if (diagram) {
    nodes.push(<StudyFlowchart key="provided-diagram" diagram={diagram} />);
  }

  let index = 0;
  while (index < blocks.length) {
    const line = blocks[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const fence = line.trim().slice(3).trim();
      const collected: string[] = [];
      index += 1;
      while (index < blocks.length && !blocks[index].trim().startsWith("```")) {
        collected.push(blocks[index]);
        index += 1;
      }
      if (index < blocks.length) index += 1;
      const body = collected.join("\n");
      if (fence === "mermaid" || /flowchart|graph\s+(TD|LR)/i.test(body)) {
        const parsed = parseMermaidNodes(body);
        if (parsed && !diagram) {
          nodes.push(<StudyFlowchart key={`mermaid-${index}`} diagram={parsed} />);
        }
      }
      continue;
    }

    if (line.trim().startsWith("|")) {
      const tableLines = [line];
      index += 1;
      while (index < blocks.length && blocks[index].trim().startsWith("|")) {
        tableLines.push(blocks[index]);
        index += 1;
      }
      nodes.push(<div key={`table-${index}`}>{renderTable(tableLines)}</div>);
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const text = line.replace(/^#{1,3}\s+/, "");
      nodes.push(
        <h3
          key={`h-${index}`}
          className="font-display text-sm text-heading"
          dangerouslySetInnerHTML={{ __html: inlineMarkdown(text) }}
        />
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < blocks.length && /^[-*]\s+/.test(blocks[index])) {
        items.push(blocks[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      nodes.push(
        <ul key={`ul-${index}`} className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {items.map((item, itemIndex) => (
            <li
              key={`${itemIndex}-${item.slice(0, 16)}`}
              dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }}
            />
          ))}
        </ul>
      );
      continue;
    }

    nodes.push(
      <p
        key={`p-${index}`}
        className="text-sm leading-relaxed text-ink"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }}
      />
    );
    index += 1;
  }

  return <div className="space-y-3">{nodes}</div>;
}
