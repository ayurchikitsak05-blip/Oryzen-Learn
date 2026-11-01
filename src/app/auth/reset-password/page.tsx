import { ResetPasswordClient, type ResetPasswordFixture } from "./reset-password-client";

function parseFixture(value: string | string[] | undefined): ResetPasswordFixture {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "ready" || raw === "expired" || raw === "invalid") return raw;
  return null;
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const allowFixtures = process.env.VERCEL_ENV !== "production";
  const fixture = allowFixtures ? parseFixture(params.fixture) : null;

  return (
    <ResetPasswordClient allowFixtures={allowFixtures} fixture={fixture} />
  );
}
