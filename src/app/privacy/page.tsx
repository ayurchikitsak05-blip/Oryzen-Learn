import React from "react";
import Link from "next/link";
import AppChrome from "@/components/layout/AppChrome";
import { ui } from "@/components/ui/classes";
import { companyName, CONSENT_NOTICE_VERSION, grievanceEmail } from "@/lib/consent/age";
import { NOTICE_DATA, NOTICE_PROMISES, NOTICE_RIGHTS } from "@/lib/consent/notice";

export const metadata = { title: "Privacy notice · ORYZEN Learn" };

/** Privacy notice (DPDP Rules 2025, rule 3): what we keep, why, and the student's and parent's rights. */
export default function PrivacyPage() {
  const email = grievanceEmail();
  return (
    <AppChrome subtitle="Privacy" nav="marketing">
      <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-8 text-sm leading-relaxed text-ink" data-testid="privacy">
        <header>
          <h1 className={`${ui.heading} text-3xl`}>Privacy notice</h1>
          <p className="mt-2 text-muted">
            ORYZEN Learn is run by {companyName()}. This notice explains what we keep about students, why, and how to use
            your rights under India&apos;s Digital Personal Data Protection Act, 2023. Version {CONSENT_NOTICE_VERSION}.
          </p>
        </header>

        <section className="space-y-2">
          <h2 className="font-semibold text-heading">What we keep and why</h2>
          <ul className="space-y-2">
            {NOTICE_DATA.map((item) => (
              <li key={item.what}>
                <span className="font-semibold text-heading">{item.what}.</span> {item.why}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-heading">Students under 18</h2>
          <p>
            A parent or guardian must agree before a student under 18 can use ORYZEN. The parent signs in with their own
            email, confirms they are 18 or older and the student&apos;s parent or guardian, and agrees. They can withdraw
            at any time from the{" "}
            <Link href="/parent" className="underline underline-offset-2">
              parent page
            </Link>
            .
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {NOTICE_PROMISES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-heading">Your rights</h2>
          <ul className="list-disc space-y-1 pl-5">
            {NOTICE_RIGHTS.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-semibold text-heading">Contact and complaints</h2>
          {email ? (
            <p>
              Write to us at{" "}
              <a href={`mailto:${email}`} className="underline underline-offset-2" data-testid="privacy-email">
                {email}
              </a>{" "}
              to see, correct or delete data, or to complain. We reply within 90 days at most. If you&apos;re not satisfied,
              you can complain to the Data Protection Board of India.
            </p>
          ) : (
            <p data-testid="privacy-no-email">
              Contact details for privacy requests will be shown here. If you&apos;re not satisfied with our reply, you can
              complain to the Data Protection Board of India.
            </p>
          )}
        </section>
      </main>
    </AppChrome>
  );
}
