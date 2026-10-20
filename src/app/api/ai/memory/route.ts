import { NextResponse, type NextRequest } from "next/server";
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
    let resolvedUserId = body.userId ?? "local-student-scholar";

    if (supabase) {
      const { data } = await supabase.auth
        .getUser()
        .catch(() => ({ data: { user: null } }));
      if (data?.user?.id) {
        resolvedUserId = data.user.id;
      }
    }

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
