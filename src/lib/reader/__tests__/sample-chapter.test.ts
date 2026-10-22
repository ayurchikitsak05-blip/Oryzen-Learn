import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scrapePdfStreamPages } from "../document-parser";
import {
  SAMPLE_CHAPTER_FILE,
  SAMPLE_CHAPTER_PAGES,
  SAMPLE_CHAPTER_PUBLIC_PATH,
  SAMPLE_CHAPTER_TITLE,
  buildRectangleAreaSamplePdf,
  buildSampleTextbookChapterPdf,
} from "../sample-chapter";

describe("longer sample textbook chapter", () => {
  it("has formulas and prose across several pages", () => {
    const bytes = buildSampleTextbookChapterPdf();
    const scraped = scrapePdfStreamPages(bytes);
    expect(scraped.pages.length).toBeGreaterThanOrEqual(5);
    const joined = scraped.pages.join(" ");
    expect(joined).toMatch(/W = F x d|KE = \(1\/2\) m v\^2|PE = m g h|P = W \/ t/);
    expect(joined).toMatch(/joule|kinetic energy|potential energy|watt/i);
    expect(joined.length).toBeGreaterThan(1200);
    expect(SAMPLE_CHAPTER_PAGES.length).toBeGreaterThanOrEqual(6);
    expect(SAMPLE_CHAPTER_TITLE).toMatch(/Work and Energy/i);
    expect(SAMPLE_CHAPTER_PUBLIC_PATH).toBe(`/demo-fixtures/${SAMPLE_CHAPTER_FILE}`);
  });

  it("keeps the 8 cm by 5 cm rectangle fixture available as a short PDF", () => {
    const bytes = buildRectangleAreaSamplePdf();
    const joined = scrapePdfStreamPages(bytes).pages.join(" ");
    expect(joined).toMatch(/length is 8 cm/i);
    expect(joined).toMatch(/width is 5 cm/i);
    expect(joined).toMatch(/40 square/i);
  });

  it("is published under public/demo-fixtures in addition to circuit and triangle", () => {
    const dir = join(process.cwd(), "public", "demo-fixtures");
    const chapter = join(dir, SAMPLE_CHAPTER_FILE);
    const circuit = join(dir, "science-circuit-current.pdf");
    const triangle = join(dir, "mathematics-triangle-pythagoras.pdf");
    const rectangle = join(dir, "mathematics-rectangle-area.pdf");
    expect(existsSync(circuit)).toBe(true);
    expect(existsSync(triangle)).toBe(true);
    expect(existsSync(chapter)).toBe(true);
    expect(existsSync(rectangle)).toBe(true);
    const chapterBytes = new Uint8Array(readFileSync(chapter));
    const scraped = scrapePdfStreamPages(chapterBytes);
    expect(scraped.pages.length).toBeGreaterThanOrEqual(5);
    expect(scraped.pages.join(" ")).toMatch(/W = F x d|joule/i);
  });
});
