import { NextResponse, type NextRequest } from "next/server";
import {
  OWNER_DEMO_COOKIE,
  allowsLocalOwnerDemoBypass,
  isLocalDemoHost,
} from "@/lib/demo/owner-demo";

export async function POST(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  if (!isLocalDemoHost(hostname) || process.env.VERCEL_ENV === "production") {
    return NextResponse.json(
      { error: "Local owner demo mode is not available here." },
      { status: 403 }
    );
  }

  const response = NextResponse.json({
    status: "local_owner_demo",
    notice:
      "LOCAL OWNER DEMO MODE is a labeled localhost fallback. It does not bypass Production security.",
    next: "/reader",
  });
  response.cookies.set(OWNER_DEMO_COOKIE, "1", {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  const enabled = allowsLocalOwnerDemoBypass({
    hostname,
    vercelEnv: process.env.VERCEL_ENV,
    cookieValue: "1",
  });
  if (!enabled) {
    return NextResponse.json(
      { error: "Local owner demo mode is not available here." },
      { status: 403 }
    );
  }
  return response;
}
