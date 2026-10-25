import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthorizedUserId } from "@/lib/auth/request-user";
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
      studentQuestion?: string;
      conversationHistory?: Array<{ question: string; answer: string }>;
      prakritiDosha?: Dosha;
      activePageText?: string;
      candidateChunks?: CitationReadyChunk[];
      maxProviderAttempts?: number;
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

    if (body.lensType === "ask_my_book") {
      const question = body.studentQuestion?.replace(/\s+/g, " ").trim() ?? "";
      if (question.length < 3) {
        return NextResponse.json(
          { error: "Ask a question about this passage." },
          { status: 400 }
        );
      }
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

    const result = await executeControlledAiGateway({
      userId: resolvedUserId,
      documentId: body.documentId,
      documentHash: body.documentHash,
      pageNumber: body.pageNumber,
      sectionHeading: body.sectionHeading ?? `Page ${body.pageNumber}`,
      selectedText: body.selectedText,
      selectionBoundingBox: body.selectionBoundingBox,
      lensType: body.lensType,
      studentQuestion: body.studentQuestion,
      conversationHistory: body.conversationHistory,
      prakritiDosha: body.prakritiDosha ?? "Vata",
      activePageText: body.activePageText,
      candidateChunks: (body.candidateChunks ?? []).filter(
        (chunk) => chunk.document_id === body.documentId
      ),
      documentClass: "private_upload",
      supabase,
      maxProviderAttempts: body.maxProviderAttempts === 1 ? 1 : undefined,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "AI Gateway request failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
