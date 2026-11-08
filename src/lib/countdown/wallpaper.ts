/**
 * Exam countdown wallpaper (owner list A, 8 Nov 2026). A website can't place a live widget
 * on the home screen, so the student downloads today's countdown as a phone-sized picture
 * and sets it as wallpaper. Drawn on the phone; no server, no AI.
 */

export const WALLPAPER_WIDTH = 1080;
export const WALLPAPER_HEIGHT = 2340;

export function daysUntil(examDate: string, today: string): number {
  const exam = Date.parse(`${examDate}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (!Number.isFinite(exam) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.round((exam - now) / 86_400_000));
}

export function countdownLine(days: number): string {
  if (days === 0) return "Exam day. You've got this.";
  if (days === 1) return "1 day to go";
  return `${days} days to go`;
}

export function formatExamDate(examDate: string): string {
  const date = new Date(`${examDate}T00:00:00Z`);
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export interface WallpaperColours {
  bg: string;
  heading: string;
  ink: string;
  accent: string;
}

/** Draws the wallpaper onto a canvas context (kept separate so it can be tested). */
export function drawWallpaper(
  ctx: CanvasRenderingContext2D,
  input: { examName: string; examDate: string; today: string; thought: string; colours: WallpaperColours }
): void {
  const { colours } = input;
  const w = WALLPAPER_WIDTH;
  const h = WALLPAPER_HEIGHT;
  ctx.fillStyle = colours.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = colours.accent;
  ctx.font = "600 64px system-ui, sans-serif";
  ctx.fillText(input.examName.toUpperCase().slice(0, 28), w / 2, h * 0.36);

  const days = daysUntil(input.examDate, input.today);
  ctx.fillStyle = colours.heading;
  ctx.font = "700 360px Georgia, serif";
  ctx.fillText(days === 0 ? "Today" : String(days), w / 2, h * 0.47);
  ctx.font = "500 76px system-ui, sans-serif";
  ctx.fillText(days === 0 ? "Exam day" : days === 1 ? "day to go" : "days to go", w / 2, h * 0.57);

  ctx.fillStyle = colours.ink;
  ctx.font = "400 48px system-ui, sans-serif";
  ctx.fillText(formatExamDate(input.examDate), w / 2, h * 0.62);

  // Today's thought, wrapped to a few lines.
  ctx.font = "italic 44px Georgia, serif";
  const words = input.thought.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > w * 0.78 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((text, index) => ctx.fillText(text, w / 2, h * 0.72 + index * 62));

  ctx.fillStyle = colours.accent;
  ctx.font = "600 40px system-ui, sans-serif";
  ctx.fillText("ORYZEN Learn", w / 2, h * 0.9);
}
