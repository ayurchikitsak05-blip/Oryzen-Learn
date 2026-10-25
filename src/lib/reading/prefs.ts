export const READING_SIZE_KEY = "oryzen_reading_size_v1";

export const READING_SIZES = ["compact", "comfortable", "roomy"] as const;

export type ReadingSize = (typeof READING_SIZES)[number];

export const READING_SIZE_LABELS: Record<ReadingSize, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  roomy: "Roomy",
};

export function isReadingSize(value: unknown): value is ReadingSize {
  return typeof value === "string" && (READING_SIZES as readonly string[]).includes(value);
}

/** Device display preference. It is not student work and is not copied between accounts. */
export function readReadingSize(): ReadingSize {
  if (typeof window === "undefined") return "comfortable";
  try {
    const value = window.localStorage.getItem(READING_SIZE_KEY);
    return isReadingSize(value) ? value : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function applyReadingSize(size: ReadingSize): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.readingSize = size;
}

export function writeReadingSize(size: ReadingSize): ReadingSize {
  const next = isReadingSize(size) ? size : "comfortable";
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(READING_SIZE_KEY, next);
    } catch {
      // Ignore private-mode storage failures.
    }
  }
  applyReadingSize(next);
  return next;
}

export const READING_SIZE_BOOT_SCRIPT = `(function(){try{var s=localStorage.getItem("${READING_SIZE_KEY}");if(s==="compact"||s==="comfortable"||s==="roomy"){document.documentElement.dataset.readingSize=s;}else{document.documentElement.dataset.readingSize="comfortable";}}catch(e){document.documentElement.dataset.readingSize="comfortable";}})();`;
