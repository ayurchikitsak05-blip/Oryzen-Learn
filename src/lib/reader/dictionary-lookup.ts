export const DICTIONARY_LOOKUP_TIMEOUT_MS = 4000;

export type DictionaryEntry = {
  word: string;
  phonetic: string | null;
  partOfSpeech: string | null;
  definition: string;
};

export type DictionaryLookupStatus = "ready" | "missing" | "timeout" | "error";

export type DictionaryLookupResult =
  | { status: "ready"; entry: DictionaryEntry }
  | { status: "missing" }
  | { status: "timeout" }
  | { status: "error" };

export type DictionaryLookupOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function stripMarkup(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function combineAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        if (!controller.signal.aborted) controller.abort(signal.reason);
      },
      { once: true }
    );
  }
  return controller.signal;
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

async function lookupFreeDictionary(
  word: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<DictionaryEntry | "missing" | "error"> {
  const response = await fetchImpl(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
    { signal }
  );
  if (response.status === 404) return "missing";
  if (!response.ok) return "error";
  const payload = (await response.json()) as Array<{
    phonetic?: string;
    meanings?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{ definition?: string }>;
    }>;
  }>;
  const first = payload[0];
  const meaning = first?.meanings?.[0];
  const definition = meaning?.definitions?.[0]?.definition?.trim();
  if (!definition) return "missing";
  return {
    word,
    phonetic: first.phonetic ?? null,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    definition,
  };
}

async function lookupWiktionary(
  word: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch
): Promise<DictionaryEntry | "missing" | "error"> {
  const response = await fetchImpl(
    `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`,
    { signal }
  );
  if (response.status === 404) return "missing";
  if (!response.ok) return "error";
  const payload = (await response.json()) as {
    en?: Array<{
      partOfSpeech?: string;
      definitions?: Array<{ definition?: string }>;
    }>;
  };
  const meaning = payload.en?.[0];
  const definition = stripMarkup(meaning?.definitions?.[0]?.definition ?? "");
  if (!definition) return "missing";
  return {
    word,
    phonetic: null,
    partOfSpeech: meaning?.partOfSpeech ?? null,
    definition,
  };
}

/**
 * Looks up a word with a hard timeout so the reader never sticks on “Looking up…”.
 * Tries the free dictionary first, then Wiktionary. Does not wait on a hung public API.
 */
export async function lookupDictionaryEntry(
  word: string,
  options: DictionaryLookupOptions = {}
): Promise<DictionaryLookupResult> {
  const query = word.trim().toLowerCase();
  if (!query) return { status: "missing" };

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DICTIONARY_LOOKUP_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort("timeout");
  }, timeoutMs);
  const signal = options.signal
    ? combineAbortSignals([options.signal, timeoutController.signal])
    : timeoutController.signal;

  const run = async (
    lookup: (
      nextWord: string,
      nextSignal: AbortSignal,
      nextFetch: typeof fetch
    ) => Promise<DictionaryEntry | "missing" | "error">
  ) => {
    try {
      return await lookup(query, signal, fetchImpl);
    } catch (error: unknown) {
      if (isAbortError(error)) throw error;
      return "error" as const;
    }
  };

  const timedOut = () => timeoutController.signal.aborted;

  try {
    const primary = await run(lookupFreeDictionary);
    if (timedOut()) return { status: "timeout" };
    if (primary !== "missing" && primary !== "error") {
      return { status: "ready", entry: primary };
    }
    const secondary = await run(lookupWiktionary);
    if (timedOut()) return { status: "timeout" };
    if (secondary !== "missing" && secondary !== "error") {
      return { status: "ready", entry: secondary };
    }
    if (primary === "missing" || secondary === "missing") {
      return { status: "missing" };
    }
    return { status: "error" };
  } catch (error: unknown) {
    if (timedOut()) return { status: "timeout" };
    if (options.signal?.aborted) throw error;
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}
