import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    action?: "grant" | "revoke" | "grant_email";
    studentId?: string;
    email?: string;
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const result =
    body.action === "grant_email"
      ? await supabase.rpc("grant_student_by_email", {
          student_email: body.email ?? "",
        })
      : await supabase.rpc("set_student_class_access", {
          student: body.studentId,
          next_action: body.action,
        });

  if (result.error) {
    const status = result.error.message.toLowerCase().includes("instructor") ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json({ ok: true, result: result.data });
}
