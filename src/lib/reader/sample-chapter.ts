/**
 * Authorized-style original sample chapter (not copied from a commercial textbook).
 * Longer than the one-page circuit / rectangle fixtures, with formulas and prose.
 */

export const SAMPLE_CHAPTER_FILE = "science-work-energy-chapter.pdf";
export const SAMPLE_CHAPTER_PUBLIC_PATH = `/demo-fixtures/${SAMPLE_CHAPTER_FILE}`;
export const SAMPLE_CHAPTER_TITLE = "Work and Energy — Sample Chapter";

export const SAMPLE_CHAPTER_PAGES: string[] = [
  "CHAPTER 6 WORK AND ENERGY | 6.1 Meaning of work. In physics, work is done only when a force moves an object along a path. The formula is W = F x d, where W is work, F is the force in the direction of the motion, and d is the displacement. The SI unit of work is the joule (J). One joule is the work done by a force of 1 newton acting through 1 metre. Worked example. A student pushes a crate with a force of 10 N along a smooth floor for 3 m. The force is in the same direction as the motion, so W = 10 x 3 = 30 J. If the crate does not move, the displacement is 0 m and the work is 0 J, even if the student feels tired.",
  "6.2 DIRECTION OF THE FORCE | Only the part of the force along the displacement counts as work. If the force is at a right angle to the motion, that part is zero, so the work is zero. A student who carries a bag across a flat corridor at constant height does no work against gravity on the bag, because the weight is vertical and the path is horizontal. If the same student then lifts the bag onto a shelf, the force and the displacement point the same way, so work is done. Keep the units together: 30 J is not the same as 30 N.",
  "6.3 KINETIC ENERGY | Energy is the capacity to do work. Kinetic energy is the energy of motion. The formula is KE = (1/2) m v^2, where m is mass in kilograms and v is speed in metres per second. Doubling the speed multiplies the kinetic energy by four, because the speed is squared. Worked example. A 2 kg trolley moves at 3 m/s. KE = 0.5 x 2 x 3 x 3 = 9 J. If the trolley slows to 1 m/s, KE becomes 1 J. The lost 8 J was transferred, often as heat in the brakes or as work done on another object.",
  "6.4 POTENTIAL ENERGY | Gravitational potential energy depends on height. The formula is PE = m g h, where g is about 10 N/kg near Earth and h is the height gained. Worked example. A 2 kg mass is raised 5 m. PE = 2 x 10 x 5 = 100 J. That 100 J came from the work done in lifting. In a closed system the total energy stays the same: as a ball falls, potential energy becomes kinetic energy. A common mix-up is to treat height as speed. Height is a position; speed is how fast the position is changing.",
  "6.5 POWER | Power is how quickly work is done. The formula is P = W / t, where t is time in seconds. The SI unit is the watt (W). One watt means one joule each second. Worked example. A motor does 60 J of work in 2 s. P = 60 / 2 = 30 W. A second motor that does the same 60 J in 6 s has a power of only 10 W. Power does not tell you the total energy by itself; you also need the time. Cover the formula and say it: power equals work divided by time.",
  "6.6 CHAPTER REVIEW | Hold these relations together. Work: W = F x d. Kinetic energy: KE = (1/2) m v^2. Potential energy: PE = m g h. Power: P = W / t. Units stay with the quantity: N with force, m with distance, J with work and energy, W with power. Practice A. A 8 N force pushes a box 5 m in the same direction. What is the work? Practice B. That work is done in 4 s. What is the power? Practice C. Why is the answer to A written in joules, not in newtons? Check yourself by covering this page and writing the four formulas from memory.",
];

function wrapLine(text: string, width: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Builds a multi-page, selectable-text PDF for the sample textbook chapter.
 */
export function buildSampleTextbookChapterPdf(
  pages: string[] = SAMPLE_CHAPTER_PAGES
): Uint8Array {
  const objects: string[] = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  const pageObjNumbers = pages.map((_, idx) => 4 + idx * 2);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [ ${pageObjNumbers
      .map((n) => `${n} 0 R`)
      .join(" ")} ] /Count ${pages.length} >>\nendobj\n`
  );
  objects.push(
    "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
  );

  pages.forEach((rawText, idx) => {
    const pageObjNum = 4 + idx * 2;
    const contentObjNum = pageObjNum + 1;
    const [headingPart, bodyPart] = rawText.split("|").map((part) => part.trim());
    const safeHeading = (headingPart || `CHAPTER PAGE ${idx + 1}`).replace(
      /[()\\]/g,
      ""
    );
    const safeBody = (bodyPart || "Study text.").replace(/[()\\]/g, "");
    const bodyLines = wrapLine(safeBody, 78);
    const bodyCommands = bodyLines
      .map((line) => `0 -16 Td (${line}) Tj`)
      .join("\n");
    const streamContent = [
      "BT",
      "/F1 14 Tf",
      `48 742 Td (${safeHeading}) Tj`,
      "/F1 9 Tf",
      `0 -14 Td (Page ${idx + 1} of ${pages.length}  |  ORYZEN Learn sample chapter) Tj`,
      "/F1 11 Tf",
      bodyCommands,
      "ET",
    ].join("\n");

    objects.push(
      `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentObjNum} 0 R >>\nendobj\n`
    );
    objects.push(
      `${contentObjNum} 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`
    );
  });

  let pdfText = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdfText.length);
    pdfText += obj;
  }
  const xrefOffset = pdfText.length;
  pdfText += `xref\n0 ${objects.length + 1}\n`;
  pdfText += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdfText += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdfText += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdfText);
}

export function buildRectangleAreaSamplePdf(): Uint8Array {
  return buildSampleTextbookChapterPdf([
    "AREA OF A RECTANGLE | The area of a rectangle is length times width. If the length is 8 cm and the width is 5 cm, the area is 40 square centimetres. Area counts the unit squares that fill the shape. Keep the square unit with the number: 40 cm^2 is not the same as 40 cm.",
    "CHECK THE FORMULA | Cover the page and say it: area equals length times width. If the width became 6 cm and the length stayed 8 cm, the area would be 48 square centimetres.",
  ]);
}
