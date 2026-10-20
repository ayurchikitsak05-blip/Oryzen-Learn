import { NextResponse, type NextRequest } from "next/server";
import { canonicalInviteCode } from "@/lib/access/gate";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = canonicalInviteCode(body.code ?? "");
    if (code.length < 8) {
      return NextResponse.json(
        { error: "Enter the class invite code from your instructor." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Sign in before using a class code." }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("redeem_class_invite", {
      invite_code: code,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      accessStatus: "class_sponsored",
      result: data,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not redeem the class code.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
