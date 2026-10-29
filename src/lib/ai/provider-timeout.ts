import type { GatewayTaskType } from "./gateway";

/** Default budget for explain, revise, quiz, and similar lenses. */
export const STANDARD_PROVIDER_CALL_TIMEOUT_MS = 20_000;

/**
 * Illustrate and Story return large structured JSON. A 20s abort cuts them off
 * mid-generation and falls back before diagrams or story beats finish.
 */
export const HEAVY_PROVIDER_CALL_TIMEOUT_MS = 45_000;

const HEAVY_LENSES = new Set<GatewayTaskType>(["illustrative", "story"]);

export function isHeavyStructuredLens(
  lensType: GatewayTaskType | "markdown" | null | undefined
): boolean {
  return typeof lensType === "string" && HEAVY_LENSES.has(lensType as GatewayTaskType);
}

export function providerCallTimeoutMs(
  lensType?: GatewayTaskType | "markdown" | null
): number {
  return isHeavyStructuredLens(lensType)
    ? HEAVY_PROVIDER_CALL_TIMEOUT_MS
    : STANDARD_PROVIDER_CALL_TIMEOUT_MS;
}

/**
 * Abort the provider call after `ms`, even if the underlying SDK ignores the signal.
 * Always rejects with `TimeoutError` when the budget expires.
 */
export async function withProviderCallTimeout<T>(
  ms: number,
  work: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const timeoutError = new Error("timeout");
      timeoutError.name = "TimeoutError";
      reject(timeoutError);
    }, ms);
  });

  try {
    return await Promise.race([work(controller.signal), timeoutPromise]);
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("timeout");
      timeoutError.name = "TimeoutError";
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
