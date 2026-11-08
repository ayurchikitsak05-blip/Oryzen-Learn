/**
 * Exam countdown wallpaper (owner list A, 8 Nov 2026). A website can't place a live widget
 * on the home screen, so the student downloads today's countdown as a phone-sized picture
 * and sets it as wallpaper. Drawn on the phone; no server, no AI.
 */

export const WALLPAPER_WIDTH = 1080;
export const WALLPAPER_HEIGHT = 2340;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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
  const [year, month, day] = examDate.split("-").map(Number);
  if (!year || !month || !day) return examDate;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${yearMonth}-${String(last).padStart(2, "0")}`;
}

export interface CountdownView {
  /** The big number, or a word on the day. */
  big: string;
  /** Under the number: "days to go", "about … days to go", "Exam month". */
  unit: string;
  /** One line for the card: "NEET: 175 days to go". */
  line: string;
  /** "2 May 2027", or "May 2027" when only the month is known. */
  dateLabel: string;
}

/**
 * What the countdown shows today, or null once the exam is over. When the student only chose
 * the month (first run), the count is to the start of that month and says "about".
 */
export function countdownView(examDate: string, today: string, examMonth?: string): CountdownView | null {
  if (examMonth) {
    const [year, month] = examMonth.split("-").map(Number);
    const dateLabel = `${MONTHS[month - 1]} ${year}`;
    if (today > lastDayOfMonth(examMonth)) return null;
    const days = daysUntil(`${examMonth}-01`, today);
    if (days === 0) return { big: dateLabel.split(" ")[0], unit: "Exam month", line: "Exam month. You've got this.", dateLabel };
    return {
      big: String(days),
      unit: days === 1 ? "day to your exam month" : "days to your exam month",
      line: `about ${days} day${days === 1 ? "" : "s"} to go`,
      dateLabel,
    };
  }
  if (examDate < today) return null;
  const days = daysUntil(examDate, today);
  return {
    big: days === 0 ? "Today" : String(days),
    unit: days === 0 ? "Exam day" : days === 1 ? "day to go" : "days to go",
    line: countdownLine(days),
    dateLabel: formatExamDate(examDate),
  };
}

export interface WallpaperColours {
  bg: string;
  heading: string;
  ink: string;
  accent: string;
}

/** Sets the largest font (down to a floor) at which the text fits in the given width. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: string, start: number, min: number, family: string, width: number): void {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > width) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${family}`;
  }
}

/** Draws the wallpaper onto a canvas context (kept separate so it can be tested). */
export function drawWallpaper(
  ctx: CanvasRenderingContext2D,
  input: { examName: string; examDate: string; examMonth?: string; today: string; thought: string; colours: WallpaperColours }
): void {
  const { colours } = input;
  const w = WALLPAPER_WIDTH;
  const h = WALLPAPER_HEIGHT;
  const view = countdownView(input.examDate, input.today, input.examMonth);
  ctx.fillStyle = colours.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const sans = "system-ui, sans-serif";
  let name = input.examName.toUpperCase().trim() || "EXAM";
  if (name.length > 40) name = `${name.slice(0, 39)}…`;
  ctx.fillStyle = colours.accent;
  fitFont(ctx, name, "600", 64, 36, sans, w * 0.86);
  ctx.fillText(name, w / 2, h * 0.36);

  if (view) {
    ctx.fillStyle = colours.heading;
    fitFont(ctx, view.big, "700", 360, 120, "Georgia, serif", w * 0.86);
    ctx.fillText(view.big, w / 2, h * 0.47);
    fitFont(ctx, view.unit, "500", 76, 40, sans, w * 0.86);
    ctx.fillText(view.unit, w / 2, h * 0.57);
    ctx.fillStyle = colours.ink;
    ctx.font = `400 48px ${sans}`;
    ctx.fillText(view.dateLabel, w / 2, h * 0.62);
  }

  // Today's thought, wrapped to a few lines.
  ctx.fillStyle = colours.ink;
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
  ctx.font = `600 40px ${sans}`;
  ctx.fillText("ORYZEN Learn", w / 2, h * 0.9);
}
