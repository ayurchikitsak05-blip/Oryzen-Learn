import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthorizedUserId } from "@/lib/auth/request-user";
import { createClient } from "@/lib/supabase/server";
import {
  applyExamBoosterPack,
  evaluateAndConsumeQuota,
  getOrInitUserQuotaState,
  PLAN_ENTITLEMENTS,
  upgradeUserPlanTier,
  type MeteredResourceType,
  type SubscriptionPlanTier,
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
      action: "consume" | "upgrade_tier" | "buy_booster";
      userId?: string;
      resource?: MeteredResourceType;
      newTier?: SubscriptionPlanTier;
      packCount?: number;
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

    if (body.action === "upgrade_tier") {
      if (!body.newTier || !(body.newTier in PLAN_ENTITLEMENTS)) {
        return NextResponse.json(
          { error: "Valid newTier is required ('free', 'pro_monthly', 'exam_pass_6mo')." },
          { status: 400 }
        );
      }
      const state = await upgradeUserPlanTier({
        userId,
        newTier: body.newTier,
        supabase,
      });
      return NextResponse.json({
        status: "upgraded",
        state,
        entitlements: PLAN_ENTITLEMENTS[state.planTier],
      });
    }

    if (body.action === "buy_booster") {
      const state = await applyExamBoosterPack({
        userId,
        packCount: body.packCount ?? 1,
        supabase,
      });
      return NextResponse.json({
        status: "booster_applied",
        state,
      });
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
    const message =
      err instanceof Error ? err.message : "Billing quota operation failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
