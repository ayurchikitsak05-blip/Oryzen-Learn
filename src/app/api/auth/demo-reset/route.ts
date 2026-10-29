import { NextResponse, type NextRequest } from "next/server";
import {
  PUBLIC_DEMO_COOKIE,
  PUBLIC_DEMO_VISITOR_COOKIE,
  createDemoVisitorId,
  isPublicDemoEnabled,
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

  const visitorId = createDemoVisitorId();
  const response = NextResponse.json({
    status: "public_demo_reset",
    visitorId,
    notice: "Demo workspace reset. Previous demo data on this browser should be cleared client-side.",
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
