import { NextResponse, type NextRequest } from "next/server";
import {
  PUBLIC_DEMO_COOKIE,
  PUBLIC_DEMO_EMAIL,
  PUBLIC_DEMO_VISITOR_COOKIE,
  isPublicDemoSession,
} from "@/lib/demo/public-demo";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  if (
    isPublicDemoSession({
      hostname: request.nextUrl.hostname,
      cookieValue: request.cookies.get(PUBLIC_DEMO_COOKIE)?.value,
      visitorId: request.cookies.get(PUBLIC_DEMO_VISITOR_COOKIE)?.value,
      vercelEnv: process.env.VERCEL_ENV,
    })
  ) {
    return NextResponse.json({
      userId: request.cookies.get(PUBLIC_DEMO_VISITOR_COOKIE)!.value,
      email: PUBLIC_DEMO_EMAIL,
      demo: true,
    });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  return NextResponse.json({
    userId: user.id,
    email: user.email ?? null,
  });
}
