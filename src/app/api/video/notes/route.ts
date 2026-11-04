import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleApiKey } from "@/lib/ai/providers";
import { isEntitled } from "@/lib/access/gate";
import { isVideoId } from "@/lib/video/lecture-notes";
import { lectureNotesStatus, makeLectureNotes } from "@/lib/video/lecture-notes-server";

/** Reading a 90-minute lecture can take a few minutes. */
export const maxDuration = 300;

async function signedInStudent(): Promise<{ userId: string; accessStatus: string | null } | null> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const userId = data?.user?.id;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("access_status")
    .eq("id", userId)
    .maybeSingle()
    .then(
      (res) => res,
      () => ({ data: null })
    );
  return {
    userId,
    accessStatus: (profile as { access_status?: string | null } | null)?.access_status ?? null,
  };
}

const NOT_ON = { error: "Lecture notes aren't switched on yet.", code: "not_configured" };

export async function GET(request: NextRequest) {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const videoId = request.nextUrl.searchParams.get("v")?.trim() ?? "";
  if (!isVideoId(videoId)) return NextResponse.json({ error: "Not a YouTube video." }, { status: 400 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json(NOT_ON, { status: 503 });
  try {
    const status = await lectureNotesStatus({ admin, videoId, ...student });
    return NextResponse.json({ ...status, enabled: Boolean(googleApiKey()) });
  } catch {
    return NextResponse.json({ error: "Couldn't check lecture notes just now." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isEntitled(student.accessStatus)) {
    return NextResponse.json({ error: "Choose a plan to use lecture notes.", code: "no_plan" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as { videoId?: unknown };
  const videoId = typeof body.videoId === "string" ? body.videoId.trim() : "";
  const admin = createAdminClient();
  if (!admin) return NextResponse.json(NOT_ON, { status: 503 });
  try {
    const outcome = await makeLectureNotes({ admin, videoId, apiKey: googleApiKey(), ...student });
    const { status, ...payload } = outcome;
    return NextResponse.json(payload, { status });
  } catch {
    return NextResponse.json(
      { error: "Lecture notes couldn't be made just now. Please try again later.", code: "server_error" },
      { status: 500 }
    );
  }
}
