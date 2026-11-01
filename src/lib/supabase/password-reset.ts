export type PasswordResetValidation =
  | { ok: true; password: string }
  | {
      ok: false;
      error: string;
      code: "password_too_short" | "password_mismatch";
    };

export type AuthHashClassification =
  | { kind: "recovery"; accessToken: string; refreshToken: string }
  | { kind: "session"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "empty" };

const MIN_PASSWORD_LENGTH = 8;

export function validateNewPasswordInput(input: {
  password: string;
  confirmPassword: string;
}): PasswordResetValidation {
  const password = input.password;
  const confirmPassword = input.confirmPassword;
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      code: "password_too_short",
      error: `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirmPassword) {
    return {
      ok: false,
      code: "password_mismatch",
      error: "Those passwords do not match. Enter the same password twice.",
    };
  }
  return { ok: true, password };
}

/** @deprecated Prefer validateNewPasswordInput */
export const validateNewPassword = validateNewPasswordInput;

export function describePasswordUpdateFailure(rawMessage: string): {
  error: string;
  status: 400 | 401 | 503;
} {
  const raw = rawMessage.trim();
  if (!raw) {
    return { error: "Unable to save that password.", status: 400 };
  }
  if (/session|jwt|not authenticated|auth session missing/i.test(raw)) {
    return {
      error:
        "That recovery link is invalid or has already expired. Request a new email from the sign-in page.",
      status: 401,
    };
  }
  if (/weak|password|least|characters/i.test(raw)) {
    return {
      error: "That password was rejected. Use at least 8 characters and try again.",
      status: 400,
    };
  }
  return { error: raw, status: 400 };
}

export function describeRecoveryLinkFailure(input: {
  error?: string | null;
  errorCode?: string | null;
  errorDescription?: string | null;
}): string {
  const code = input.errorCode ?? "";
  const description = (input.errorDescription ?? "").replace(/\+/g, " ");
  const error = (input.error ?? "").replace(/\+/g, " ");
  if (/code challenge/i.test(error) || /code challenge/i.test(description)) {
    return "That sign-in link could not be matched to this browser. Request a new email, or use your password.";
  }
  if (code === "otp_expired" || /expired/i.test(description) || /expired/i.test(error)) {
    return "That recovery link is invalid or has already expired. Request a new email from the sign-in page.";
  }
  if (/invalid/i.test(description) || /invalid/i.test(error) || code === "otp_disabled") {
    return "That recovery link is invalid or has already been used. Request a new email from the sign-in page.";
  }
  if (error || description) {
    return (
      description ||
      error ||
      "That recovery link could not be completed. Request a new email from the sign-in page."
    );
  }
  return "That recovery link is invalid or has already expired. Request a new email from the sign-in page.";
}

export const describeRecoveryLinkError = describeRecoveryLinkFailure;

export function describeAuthLinkQueryError(params: URLSearchParams): string | null {
  const code = params.get("error_code");
  const description = params.get("error_description");
  const error = params.get("error");
  if (!code && !description && !error) return null;
  return describeRecoveryLinkFailure({
    error,
    errorCode: code,
    errorDescription: description,
  });
}

/**
 * Classifies an auth URL hash without logging token values.
 * Recovery links include type=recovery; magic links omit it or use other types.
 */
export function classifyAuthHash(hash: URLSearchParams): AuthHashClassification {
  const hashError = hash.get("error_description") || hash.get("error");
  if (hashError) {
    return { kind: "error", message: hashError.replace(/\+/g, " ") };
  }
  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (!accessToken || !refreshToken) {
    return { kind: "empty" };
  }
  if (hash.get("type") === "recovery") {
    return { kind: "recovery", accessToken, refreshToken };
  }
  return { kind: "session", accessToken, refreshToken };
}
