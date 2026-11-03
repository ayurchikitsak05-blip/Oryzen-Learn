import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthorizedUserId } from "@/lib/auth/request-user";
import { createClient } from "@/lib/supabase/server";
import {
  evaluateAndConsumeQuota,
  getOrInitUserQuotaState,
  PLAN_ENTITLEMENTS,
  type MeteredResourceType,
} from "@/lib/billing/quotas";
import { getOwnMonthlyAiUsage } from "@/lib/ai/spend-guard";

export async function GET(request: NextRequest) {
  const requestedUserId = request.nextUrl.searchParams.get("userId");
  const supabase = await createClient().catch(() => null);
  let sessionUserId: string | null = null;
  if (supabase) {
    const { data } = await supabase.auth.getUser().catch(() => ({
      data: { user: null },
    }));
    sessionUserId = data?.user?.id ?? null;
  }
  const userId = resolveAuthorizedUserId(sessionUserId, requestedUserId);
  const state = getOrInitUserQuotaState(userId);
  const ownUsage =
    !sessionUserId || sessionUserId === userId
      ? await getOwnMonthlyAiUsage({ userId, supabase })
      : null;
  return NextResponse.json({
    state,
    entitlements: PLAN_ENTITLEMENTS[state.planTier],
    ownUsage,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      action: "consume";
      userId?: string;
      resource?: MeteredResourceType;
    };

    const supabase = await createClient().catch(() => null);
    let sessionUserId: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth.getUser().catch(() => ({
        data: { user: null },
      }));
      sessionUserId = data?.user?.id ?? null;
    }
    const userId = resolveAuthorizedUserId(sessionUserId, body.userId);

    // Plan and booster changes only happen after a verified payment on the server,
    // never from this route.
    if (!sessionUserId) {
      return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    }

    if (body.action === "consume") {
      if (!body.resource) {
        return NextResponse.json(
          { error: "resource is required ('active_pdf', 'ai_explanation', 'ai_quiz')." },
          { status: 400 }
        );
      }
      const check = await evaluateAndConsumeQuota({
        userId,
        resource: body.resource,
        supabase,
      });
      return NextResponse.json(check, { status: check.allowed ? 200 : 429 });
    }

    return NextResponse.json(
      { error: "Unsupported billing quota action." },
      { status: 400 }
    );
  } catch (err) {
    console.error("Billing quota operation failed", err);
    return NextResponse.json({ error: "Billing quota operation failed." }, { status: 500 });
  }
}
