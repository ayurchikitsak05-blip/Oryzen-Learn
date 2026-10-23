export type PasswordAuthFailure = {
  error: string;
  code?: "password_mismatch";
  status: 401 | 409 | 503;
};

export function describePasswordAuthFailure(input: {
  rawMessage: string;
  networkMessage?: string | null;
  alreadyRegistered: boolean;
  createdWithoutSession: boolean;
}): PasswordAuthFailure {
  if (input.networkMessage) {
    return { error: input.networkMessage, status: 503 };
  }

  const raw = input.rawMessage;
  const invalidPassword = /invalid login|invalid credentials/i.test(raw);
  const notConfirmed =
    /email not confirmed/i.test(raw) || input.createdWithoutSession;

  if (notConfirmed) {
    return {
      error:
        "This email is not ready for sign-in yet. Save the password on this page, then sign in.",
      code: "password_mismatch",
      status: 401,
    };
  }

  if (input.alreadyRegistered && invalidPassword) {
    return {
      error:
        "This email already has an account, and that password does not match the one that was saved.",
      code: "password_mismatch",
      status: 409,
    };
  }

  if (invalidPassword) {
    return {
      error:
        "That email and password did not match. Use the password you created on this site, or create an account if you have not signed up here yet.",
      status: 401,
    };
  }

  return { error: raw || "Unable to sign in.", status: 401 };
}
