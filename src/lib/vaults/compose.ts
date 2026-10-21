export interface TextbookSlice {
  title: string;
  excerpt: string;
}

export interface ComposedStudyMaterial {
  title: string;
  markdown: string;
  grounded: "model" | "textbook";
}

const HEADING_RE =
  /^(chapter|adhyaya|sthana|sutra|section|unit|part|module)\b/i;

function paragraphs(excerpt: string): string[] {
  return excerpt
    .split(/\n{2,}/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length > 40);
}

function headingsFrom(excerpt: string): string[] {
  const found: string[] = [];
  for (const line of excerpt.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length < 4 || trimmed.length > 120) continue;
    const letters = trimmed.replace(/[^A-Za-z]/g, "");
    const looksHeading =
      HEADING_RE.test(trimmed) ||
      (letters.length >= 4 && trimmed === trimmed.toUpperCase() && !trimmed.endsWith("."));
    if (looksHeading && !found.includes(trimmed)) found.push(trimmed);
  }
  return found.slice(0, 12);
}

export function composeStudyNotes(sources: readonly TextbookSlice[]): string {
  const usable = sources.filter((source) => source.excerpt.trim().length > 0);
  if (usable.length === 0) {
    return "Upload a textbook PDF before generating study notes.";
  }

  const lines = ["# Study notes", ""];
  for (const source of usable) {
    const heads = headingsFrom(source.excerpt);
    const paras = paragraphs(source.excerpt).slice(0, 8);
    lines.push(`## ${source.title}`);
    lines.push("");
    lines.push("### Key concepts");
    if (heads.length === 0) {
      lines.push("- Review the opening passages and mark the terms that repeat.");
    } else {
      for (const head of heads.slice(0, 8)) lines.push(`- ${head}`);
    }
    lines.push("");
    lines.push("### Chapter summaries");
    if (paras.length === 0) {
      lines.push("The extracted text is too short to summarize.");
    } else {
      paras.slice(0, 4).forEach((para, index) => {
        const sentence = para.split(/(?<=[.?!])\s/)[0] ?? para;
        lines.push(`${index + 1}. ${sentence}`);
      });
    }
    lines.push("");
    lines.push("### Structured notes");
    paras.slice(0, 6).forEach((para) => {
      lines.push(`- ${para.slice(0, 320)}`);
    });
    lines.push("");
  }
  return lines.join("\n").trim() + "\n";
}

export function composeRecallBank(sources: readonly TextbookSlice[]): string {
  const usable = sources.filter((source) => source.excerpt.trim().length > 0);
  if (usable.length === 0) {
    return "Upload a textbook PDF before generating recall questions.";
  }
  const lines = ["# Active recall", ""];
  let number = 1;
  for (const source of usable) {
    const heads = headingsFrom(source.excerpt);
    const paras = paragraphs(source.excerpt).slice(0, 6);
    const prompts = heads.length > 0 ? heads : paras.map((para) => para.slice(0, 80));
    lines.push(`## ${source.title}`);
    lines.push("");
    for (const prompt of prompts.slice(0, 8)) {
      lines.push(`${number}. Explain ${prompt} in your own words.`);
      lines.push("");
      const support = paras[0]?.slice(0, 240);
      if (support) lines.push(`Recall cue: ${support}`);
      lines.push("");
      number += 1;
    }
  }
  return lines.join("\n").trim() + "\n";
}

export function answerFromTextbook(question: string, sources: readonly TextbookSlice[]): string {
  const words = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 3);
  const paras = sources.flatMap((source) =>
    paragraphs(source.excerpt).map((text) => ({ title: source.title, text }))
  );
  const ranked = paras
    .map((para) => ({
      ...para,
      score: words.reduce(
        (sum, word) => sum + (para.text.toLowerCase().includes(word) ? 1 : 0),
        0
      ),
    }))
    .filter((para) => para.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return "The uploaded textbooks do not contain a direct passage for that question. Try a term that appears in the sources.";
  }

  const lines = ["From the uploaded textbooks:", ""];
  for (const hit of ranked) {
    lines.push(`- ${hit.title}: ${hit.text.slice(0, 420)}`);
  }
  return lines.join("\n");
}
