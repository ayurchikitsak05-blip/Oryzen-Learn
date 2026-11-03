import { notFound } from "next/navigation";
import InstituteDashboardDemo from "./InstituteDashboardDemo";

export const dynamic = "force-dynamic";

/**
 * The institute dashboard is still an in-browser demo (no real institute data or payments),
 * so it is hidden on Production until it is connected to the instructor database functions.
 */
export default function InstituteDashboardPage() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <InstituteDashboardDemo />;
}
