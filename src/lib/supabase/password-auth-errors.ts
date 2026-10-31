export type PasswordAuthFailure = {
  error: string;
  code?: "password_mismatch" | "password_replace_disabled";
  status: 401 | 403 | 409 | 503;
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
        "This email is not ready for password sign-in yet. Request an email sign-in link to open your account, or wait for the confirmation email.",
      code: "password_mismatch",
      status: 401,
    };
  }

  if (input.alreadyRegistered && invalidPassword) {
    return {
      error:
        "This email already has an account, and that password does not match. Request an email sign-in link to prove you own the account. Passwords cannot be replaced from this page.",
      code: "password_mismatch",
      status: 409,
    };
  }

  if (invalidPassword) {
    return {
      error:
        "That email and password did not match. Use the password you created on this site, request an email sign-in link, or create an account if you have not signed up here yet.",
      status: 401,
    };
  }

  return { error: raw || "Unable to sign in.", status: 401 };
}
