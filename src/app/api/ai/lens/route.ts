import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  executeControlledAiGateway,
  type GatewayTaskType,
} from "@/lib/ai/gateway";
import type { Dosha } from "@/lib/prakriti/config";
import type { BoundingBox, CitationReadyChunk } from "@/lib/reader/extractor";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      userId?: string;
      documentId?: string;
      documentHash?: string;
      pageNumber?: number;
      sectionHeading?: string;
      selectedText?: string;
      selectionBoundingBox?: BoundingBox;
      lensType?: GatewayTaskType;
      prakritiDosha?: Dosha;
      activePageText?: string;
      candidateChunks?: CitationReadyChunk[];
    };

    if (
      !body.selectedText ||
      !body.documentId ||
      !body.documentHash ||
      typeof body.pageNumber !== "number" ||
      !body.lensType
    ) {
      return NextResponse.json(
        {
          error:
            "documentId, documentHash, pageNumber, selectedText, and lensType are required.",
        },
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

    const result = await executeControlledAiGateway({
      userId: resolvedUserId,
      documentId: body.documentId,
      documentHash: body.documentHash,
      pageNumber: body.pageNumber,
      sectionHeading: body.sectionHeading ?? `Page ${body.pageNumber}`,
      selectedText: body.selectedText,
      selectionBoundingBox: body.selectionBoundingBox,
      lensType: body.lensType,
      prakritiDosha: body.prakritiDosha ?? "Vata",
      activePageText: body.activePageText,
      candidateChunks: body.candidateChunks ?? [],
      supabase,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI Gateway request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
