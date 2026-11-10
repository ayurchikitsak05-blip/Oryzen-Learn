"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, Copy, Share2 } from "lucide-react";
import { ui } from "@/components/ui/classes";
import { CONSENT_RELATIONSHIPS, type ConsentRelationship } from "@/lib/consent/age";
import { NOTICE_DATA, NOTICE_PROMISES } from "@/lib/consent/notice";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

async function postConsent(body: Record<string, unknown>) {
  const response = await fetch("/api/consent", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { response, json };
}

function safeNext(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth") ? value : "/hub";
}

/** Month and year of birth. */
export function BirthMonthPicker({
  value,
  onChange,
  idPrefix,
}: {
  value: { month: string; year: string };
  onChange: (next: { month: string; year: string }) => void;
  idPrefix: string;
}) {
  const thisYear = new Date().getFullYear();
  const years = Array.from({ length: 80 }, (_, index) => String(thisYear - 5 - index));
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="block">
        <span className={ui.label}>Month</span>
        <select
          id={`${idPrefix}-month`}
          className={`${ui.input} cursor-pointer`}
          value={value.month}
          onChange={(event) => onChange({ ...value, month: event.target.value })}
          data-testid={`${idPrefix}-month`}
        >
          <option value="">Month</option>
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className={ui.label}>Year</span>
        <select
          id={`${idPrefix}-year`}
          className={`${ui.input} cursor-pointer`}
          value={value.year}
          onChange={(event) => onChange({ ...value, year: event.target.value })}
          data-testid={`${idPrefix}-year`}
        >
          <option value="">Year</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Asked once of every student: month and year of birth. */
export function AgeCheck() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState({ month: "", year: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async () => {
    if (!value.month || !value.year || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { response, json } = await postConsent({ action: "age", birthMonth: `${value.year}-${value.month}` });
      if (!response.ok) {
        setMessage(String(json.error ?? "This couldn't be saved just now. Please try again."));
        return;
      }
      router.replace(json.minor && !json.consented ? "/parent-consent" : safeNext(searchParams.get("next")));
    } catch {
      setMessage("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-4 py-8" data-testid="age-check">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>When were you born?</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          We ask once. By law in India, if you&apos;re under 18 a parent needs to agree before you use ORYZEN. Your
          date of birth is kept private and can&apos;t be changed later without contacting us.
        </p>
      </header>
      <BirthMonthPicker value={value} onChange={setValue} idPrefix="age" />
      <button
        type="button"
        className={`${ui.primary} min-h-12 w-full`}
        disabled={!value.month || !value.year || busy}
        onClick={() => void submit()}
        data-testid="age-continue"
      >
        {busy ? "Saving…" : "Continue"}
      </button>
      {message ? (
        <p className={ui.alert} role="alert">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        <Link href="/privacy" className="underline underline-offset-2">
          How we use your data
        </Link>
      </p>
    </main>
  );
}

/** Students under 18: send a link to a parent and wait for them to agree. */
export function ParentConsentWaiting() {
  const router = useRouter();
  const [status, setStatus] = useState<{ consented: boolean; minor: boolean; pendingUntil: string | null } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const check = useCallback(async () => {
    try {
      const response = await fetch("/api/consent", { credentials: "same-origin" });
      const json = (await response.json().catch(() => ({}))) as {
        status?: { consented: boolean; minor: boolean; pendingUntil: string | null; needsBirthMonth: boolean };
      };
      if (!response.ok || !json.status) return;
      if (json.status.needsBirthMonth) {
        router.replace("/age-check");
        return;
      }
      if (json.status.consented || !json.status.minor) {
        router.replace("/hub");
        return;
      }
      setStatus(json.status);
    } catch {
      // Try again on the next check.
    }
  }, [router]);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => void check(), 15_000);
    return () => window.clearInterval(timer);
  }, [check]);

  const makeLink = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setCopied(false);
    try {
      const { response, json } = await postConsent({ action: "request" });
      if (!response.ok || typeof json.link !== "string") {
        setMessage(String(json.error ?? "The link couldn't be made just now. Please try again."));
        return;
      }
      setLink(json.link);
      void check();
    } catch {
      setMessage("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const shareText = link
    ? `Please open this link and agree so I can use ORYZEN Learn for my studies. It takes 2 minutes: ${link}`
    : "";

  const share = async () => {
    if (!link) return;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "ORYZEN Learn: parent consent", text: shareText });
        return;
      } catch {
        // Cancelled: fall back to WhatsApp.
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank", "noopener");
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setMessage("Copy didn't work. Press and hold the link to copy it.");
    }
  };

  return (
    <main className="mx-auto w-full max-w-md space-y-5 px-4 py-8" data-testid="parent-consent">
      <header>
        <h1 className={`${ui.heading} text-3xl`}>Ask a parent to agree</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          You&apos;re under 18, so by law a parent or guardian must agree before you can use ORYZEN. Send them a link.
          They open it on their own phone, sign in with their own email, and agree. It takes about 2 minutes.
        </p>
      </header>

      {link ? (
        <section className={`${ui.cardPad} space-y-3`} data-testid="consent-link">
          <p className="break-all rounded-xl bg-beige-2 p-3 text-xs text-ink">{link}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={ui.primary} onClick={() => void share()} data-testid="consent-share">
              <Share2 className="h-4 w-4" aria-hidden="true" /> Send to parent
            </button>
            <button type="button" className={ui.secondary} onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
          <p className="text-xs text-muted">The link works for 7 days. This page opens the app by itself once they agree.</p>
        </section>
      ) : (
        <button
          type="button"
          className={`${ui.primary} min-h-12 w-full`}
          onClick={() => void makeLink()}
          disabled={busy}
          data-testid="consent-make-link"
        >
          {busy ? "Making the link…" : status?.pendingUntil ? "Make a new link" : "Make a link for my parent"}
        </button>
      )}
      {status?.pendingUntil && !link ? (
        <p className="text-sm text-muted">
          A link was sent earlier and works until {new Date(status.pendingUntil).toLocaleDateString("en-IN")}. Making a new
          one stops the old one.
        </p>
      ) : null}
      {message ? (
        <p className={ui.alert} role="alert">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-muted">
        <Link href="/privacy" className="underline underline-offset-2">
          What we keep and why
        </Link>
      </p>
    </main>
  );
}

function NoticeList() {
  return (
    <div className="space-y-3 text-sm text-ink">
      <ul className="space-y-2">
        {NOTICE_DATA.map((item) => (
          <li key={item.what}>
            <span className="font-semibold text-heading">{item.what}.</span> {item.why}
          </li>
        ))}
      </ul>
      <ul className="list-disc space-y-1 pl-5">
        {NOTICE_PROMISES.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type LinkState = { childName: string; state: "open" | "granted" | "closed"; isChild: boolean };
type ParentChild = { consentId: string; childName: string; relationship: string | null; grantedAt: string | null };

/** The parent's page: agree from a link (?c=…), and see or withdraw consent for their children. */
export function ParentPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("c");
  const [signedOut, setSignedOut] = useState(false);
  const [request, setRequest] = useState<LinkState | null>(null);
  const [requestError, setRequestError] = useState("");
  const [needsAge, setNeedsAge] = useState(false);
  const [age, setAge] = useState({ month: "", year: "" });
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<ConsentRelationship | "">("");
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [children, setChildren] = useState<ParentChild[]>([]);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);

  const loadChildren = useCallback(async () => {
    const response = await fetch("/api/consent?view=children", { credentials: "same-origin" }).catch(() => null);
    if (!response) return;
    if (response.status === 401) {
      setSignedOut(true);
      return;
    }
    const json = (await response.json().catch(() => ({}))) as { children?: ParentChild[] };
    setChildren(json.children ?? []);
  }, []);

  useEffect(() => {
    void (async () => {
      const own = await fetch("/api/consent", { credentials: "same-origin" }).catch(() => null);
      if (own?.status === 401) {
        setSignedOut(true);
        return;
      }
      const ownJson = own ? ((await own.json().catch(() => ({}))) as { status?: { needsBirthMonth: boolean } }) : {};
      setNeedsAge(Boolean(ownJson.status?.needsBirthMonth));
      if (token) {
        const looked = await postConsent({ action: "lookup", token }).catch(() => null);
        const response = looked?.response ?? null;
        const json = (looked?.json ?? {}) as Partial<LinkState> & { error?: string };
        if (response?.ok && json.childName && json.state) {
          setRequest({ childName: json.childName, state: json.state, isChild: Boolean(json.isChild) });
        } else {
          setRequestError(json.error ?? "This link couldn't be opened. Please try again.");
        }
      }
      await loadChildren();
    })();
  }, [token, loadChildren]);

  const agree = async () => {
    if (!token || busy) return;
    setBusy(true);
    setMessage("");
    try {
      if (needsAge) {
        if (!age.month || !age.year) {
          setMessage("Please choose your month and year of birth.");
          return;
        }
        const saved = await postConsent({ action: "age", birthMonth: `${age.year}-${age.month}` });
        if (!saved.response.ok) {
          setMessage(String(saved.json.error ?? "This couldn't be saved just now."));
          return;
        }
        setNeedsAge(false);
      }
      const { response, json } = await postConsent({ action: "grant", token, parentName: name, relationship, declared });
      if (!response.ok) {
        setMessage(String(json.error ?? "This couldn't be saved just now. Please try again."));
        return;
      }
      setDone(String(json.childName ?? "Your child"));
      await loadChildren();
    } catch {
      setMessage("No connection. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (consentId: string) => {
    setConfirmWithdraw(null);
    const { response, json } = await postConsent({ action: "withdraw", consentId }).catch(() => ({
      response: { ok: false } as Response,
      json: { error: "No connection. Please try again." } as Record<string, unknown>,
    }));
    if (!response.ok) setMessage(String(json.error ?? "This couldn't be saved just now."));
    await loadChildren();
  };

  if (signedOut) {
    const next = `/parent${token ? `?c=${encodeURIComponent(token)}` : ""}`;
    return (
      <main className="mx-auto w-full max-w-md space-y-5 px-4 py-8" data-testid="parent-signin">
        <h1 className={`${ui.heading} text-3xl`}>Parent consent</h1>
        <p className="text-sm leading-relaxed text-muted">
          Your child wants to use ORYZEN Learn for their studies. Please sign in with <strong>your own</strong> email (not
          your child&apos;s). You can sign in with a password or an email link.
        </p>
        <Link href={`/auth?form=1&next=${encodeURIComponent(next)}`} className={`${ui.primary} min-h-12 w-full`}>
          Sign in as a parent
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-lg space-y-5 px-4 py-8" data-testid="parent-page">
      <h1 className={`${ui.heading} text-3xl`}>Parent consent</h1>

      {token && requestError ? <p className={ui.alert}>{requestError}</p> : null}

      {done ? (
        <section className={`${ui.cardPad} space-y-2`} data-testid="parent-done">
          <p className="flex items-center gap-2 font-semibold text-heading">
            <Check className="h-5 w-5 text-accent" aria-hidden="true" /> Thank you. {done} can now use ORYZEN Learn.
          </p>
          <p className="text-sm text-muted">You can withdraw this any time from this page.</p>
        </section>
      ) : request ? (
        request.isChild ? (
          <p className={ui.alert} data-testid="parent-is-child">
            This link is for your parent. Send it to them so they can open it on their own phone and sign in with their
            own email.
          </p>
        ) : request.state === "granted" ? (
          <p className={ui.notice}>Consent for {request.childName} has already been given. Thank you.</p>
        ) : request.state === "closed" ? (
          <p className={ui.notice}>This link has expired. Ask {request.childName} to send a new one.</p>
        ) : (
          <section className={`${ui.cardPad} space-y-4`} data-testid="parent-form">
            <p className="text-sm leading-relaxed text-ink">
              <strong>{request.childName}</strong> wants to use ORYZEN Learn, a study app, and is under 18. Indian law (the
              Digital Personal Data Protection Act) needs a parent or guardian to agree first. Here is what we keep and
              why:
            </p>
            <NoticeList />
            <p className="text-sm text-muted">
              You can withdraw consent at any time on this page.{" "}
              <Link href="/privacy" className="underline underline-offset-2">
                Full privacy notice and your rights
              </Link>
            </p>
            {needsAge ? (
              <div>
                <p className={ui.label}>Your month and year of birth</p>
                <BirthMonthPicker value={age} onChange={setAge} idPrefix="parent-age" />
              </div>
            ) : null}
            <label className="block">
              <span className={ui.label}>Your full name</span>
              <input
                className={ui.input}
                value={name}
                maxLength={80}
                autoComplete="name"
                onChange={(event) => setName(event.target.value)}
                data-testid="parent-name"
              />
            </label>
            <fieldset>
              <legend className={ui.label}>You are their</legend>
              <div className="flex flex-wrap gap-2">
                {CONSENT_RELATIONSHIPS.map((item) => (
                  <label
                    key={item}
                    className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm ${
                      relationship === item ? ui.selected : ui.idle
                    }`}
                  >
                    <input
                      type="radio"
                      name="relationship"
                      value={item}
                      className="sr-only"
                      checked={relationship === item}
                      onChange={() => setRelationship(item)}
                      data-testid={`parent-rel-${item}`}
                    />
                    {item[0].toUpperCase() + item.slice(1)}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-start gap-3 text-sm text-ink">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4"
                checked={declared}
                onChange={(event) => setDeclared(event.target.checked)}
                data-testid="parent-declare"
              />
              <span>
                I am {request.childName}&apos;s parent or lawful guardian, I am 18 or older, and I agree to ORYZEN using
                their data as described above.
              </span>
            </label>
            <button
              type="button"
              className={`${ui.primary} min-h-12 w-full`}
              disabled={busy || !declared || !relationship || name.trim().length < 2}
              onClick={() => void agree()}
              data-testid="parent-agree"
            >
              {busy ? "Saving…" : "I agree"}
            </button>
          </section>
        )
      ) : null}

      {message ? (
        <p className={ui.alert} role="alert">
          {message}
        </p>
      ) : null}

      <section className="space-y-2" aria-labelledby="parent-children">
        <h2 id="parent-children" className="font-semibold text-heading">
          Children you&apos;ve agreed for
        </h2>
        {children.length === 0 ? <p className={ui.empty}>None yet.</p> : null}
        {children.map((child) => (
          <article key={child.consentId} className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3">
            <div>
              <p className="font-semibold text-heading">{child.childName}</p>
              <p className="text-xs text-muted">
                Agreed {child.grantedAt ? new Date(child.grantedAt).toLocaleDateString("en-IN") : ""}
              </p>
            </div>
            {confirmWithdraw === child.consentId ? (
              <span className="flex gap-1">
                <button type="button" className={ui.ghost} onClick={() => setConfirmWithdraw(null)}>
                  Keep
                </button>
                <button type="button" className={ui.secondary} onClick={() => void withdraw(child.consentId)} data-testid="parent-withdraw-confirm">
                  Withdraw
                </button>
              </span>
            ) : (
              <button type="button" className={ui.ghost} onClick={() => setConfirmWithdraw(child.consentId)} data-testid="parent-withdraw">
                Withdraw consent
              </button>
            )}
          </article>
        ))}
        {children.length > 0 ? (
          <p className="text-xs text-muted">
            Withdrawing pauses your child&apos;s account straight away. To delete their account and data, contact us from the{" "}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy page
            </Link>
            .
          </p>
        ) : null}
      </section>
    </main>
  );
}

