"use client";

import React from "react";
import type { StudyDiagram } from "@/lib/ai/lens-compose";
import { StudyDiagramView } from "@/components/reader/StudyDiagrams";

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
  return <StudyDiagramView diagram={{ ...diagram, kind: diagram.kind ?? "flowchart" }} />;
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
          className="font-reading text-[1.15em] text-heading"
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
        <ul key={`ul-${index}`} className="list-disc space-y-1.5 pl-5 text-ink">
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
        className="text-ink"
        dangerouslySetInnerHTML={{ __html: inlineMarkdown(line) }}
      />
    );
    index += 1;
  }

  return <div className="font-reading space-y-4">{nodes}</div>;
}
