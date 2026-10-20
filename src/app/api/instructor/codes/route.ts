import { NextResponse, type NextRequest } from "next/server";
import { formatInviteCode, generateInviteCode } from "@/lib/access/gate";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    label?: string;
    seatLimit?: number;
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const seatLimit = Number(body.seatLimit);
  const { data, error } = await supabase.rpc("create_class_invite", {
    label: body.label ?? "",
    seat_limit: Number.isFinite(seatLimit) ? seatLimit : null,
    invite_code: generateInviteCode(),
  });

  if (error) {
    const status = error.message.toLowerCase().includes("instructor") ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  const created = data as { code?: string };
  return NextResponse.json({
    ...created,
    displayCode: created.code ? formatInviteCode(created.code) : "",
  });
}
