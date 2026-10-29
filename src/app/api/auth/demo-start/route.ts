import { NextResponse, type NextRequest } from "next/server";
import {
  PUBLIC_DEMO_COOKIE,
  PUBLIC_DEMO_VISITOR_COOKIE,
  createDemoVisitorId,
  isPublicDemoEnabled,
  normalizeDemoVisitorId,
} from "@/lib/demo/public-demo";

export async function POST(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  if (
    !isPublicDemoEnabled({
      hostname,
      vercelEnv: process.env.VERCEL_ENV,
    })
  ) {
    return NextResponse.json(
      { error: "The public demo is not available on this deployment." },
      { status: 403 }
    );
  }

  const existing = normalizeDemoVisitorId(
    request.cookies.get(PUBLIC_DEMO_VISITOR_COOKIE)?.value
  );
  const visitorId = existing ?? createDemoVisitorId();
  const response = NextResponse.json({
    status: "public_demo",
    visitorId,
    notice:
      "PUBLIC DEMO — fictional student workspace. Simulated study replies. No real student accounts.",
    next: "/hub",
  });
  const secure = request.nextUrl.protocol === "https:";
  response.cookies.set(PUBLIC_DEMO_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
    secure,
  });
  response.cookies.set(PUBLIC_DEMO_VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
    secure,
  });
  return response;
}
