import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthorizedUserId } from "@/lib/auth/request-user";
import { createClient } from "@/lib/supabase/server";
import {
  recordCognitiveTelemetryEvent,
  type CognitiveTelemetryEventType,
} from "@/lib/ai/adaptive-memory";
import type { Dosha } from "@/lib/prakriti/config";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      eventType?: CognitiveTelemetryEventType;
      prakritiDosha?: Dosha;
      classification?: string;
      contextLabel?: string;
    };

    if (!body.eventType) {
      return NextResponse.json(
        { error: "eventType is required to record cognitive telemetry." },
        { status: 400 }
      );
    }

    const supabase = await createClient().catch(() => null);
    let sessionUserId: string | null = null;
    if (supabase) {
      const { data } = await supabase.auth
        .getUser()
        .catch(() => ({ data: { user: null } }));
      sessionUserId = data?.user?.id ?? null;
    }
    const resolvedUserId = resolveAuthorizedUserId(sessionUserId, body.userId);

    const updatedDna = await recordCognitiveTelemetryEvent({
      userId: resolvedUserId,
      eventType: body.eventType,
      prakritiDosha: body.prakritiDosha ?? "Vata",
      classification: body.classification,
      contextLabel: body.contextLabel,
      supabase,
    });

    return NextResponse.json({
      status: "updated",
      cognitiveDna: updatedDna,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to update student_cognitive_memory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
