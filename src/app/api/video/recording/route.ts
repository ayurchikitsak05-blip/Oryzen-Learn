import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { googleApiKey } from "@/lib/ai/providers";
import { allowancePlanFor } from "@/lib/ai/daily-allowance";
import { isEntitled } from "@/lib/access/gate";
import { lectureAllowance } from "@/lib/video/lecture-notes";
import { lectureNewCountThisMonth } from "@/lib/video/lecture-notes-server";
import { audioFormatFor } from "@/lib/video/recording";
import { makeRecordingNotes, prepareRecordingUpload } from "@/lib/video/recording-server";

/** Uploading and reading a 90-minute class can take a few minutes. */
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
  return { userId, accessStatus: (profile as { access_status?: string | null } | null)?.access_status ?? null };
}

const NOT_ON = { error: "Lecture recording isn't switched on yet.", code: "not_configured" };

export async function GET() {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json(NOT_ON, { status: 503 });
  try {
    const used = await lectureNewCountThisMonth(admin, student.userId);
    return NextResponse.json({
      allowance: lectureAllowance(allowancePlanFor(student.accessStatus), used),
      enabled: Boolean(googleApiKey()),
    });
  } catch {
    return NextResponse.json({ error: "Couldn't check your lectures just now." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const student = await signedInStudent();
  if (!student) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isEntitled(student.accessStatus)) {
    return NextResponse.json({ error: "Choose a plan to use lecture notes.", code: "no_plan" }, { status: 403 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json(NOT_ON, { status: 503 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (body.action === "prepare") {
      const format = audioFormatFor(
        typeof body.mimeType === "string" ? body.mimeType : "",
        typeof body.fileName === "string" ? body.fileName : ""
      );
      if (!format) {
        return NextResponse.json(
          {
            error: "This file type can't be used. Use an audio recording (m4a, mp3, webm, ogg, wav or aac).",
            code: "bad_type",
          },
          { status: 400 }
        );
      }
      const prepared = await prepareRecordingUpload({
        admin,
        ...student,
        format,
        sizeBytes: Number(body.sizeBytes),
      });
      if (!prepared.ok) {
        const { status, ...payload } = prepared;
        return NextResponse.json(payload, { status });
      }
      return NextResponse.json({ ...prepared, contentType: format.upload });
    }
    if (body.action === "make") {
      const outcome = await makeRecordingNotes({
        admin,
        ...student,
        recordingId: typeof body.recordingId === "string" ? body.recordingId : "",
        ext: typeof body.ext === "string" ? body.ext : "",
        apiKey: googleApiKey(),
      });
      const { status, ...payload } = outcome;
      return NextResponse.json(payload, { status });
    }
    return NextResponse.json({ error: "Unknown request." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Lecture notes couldn't be made just now. Please try again later.", code: "server_error" },
      { status: 500 }
    );
  }
}
