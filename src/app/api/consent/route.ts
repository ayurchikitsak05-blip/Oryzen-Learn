import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { consentLink, indiaToday, isRelationship, parseBirthMonth } from "@/lib/consent/age";
import {
  childConsentStatus,
  childrenForParent,
  consentRequestForParent,
  createConsentLink,
  grantConsent,
  saveBirthMonth,
  withdrawConsent,
  type ConsentResult,
} from "@/lib/consent/server";

/** Age check and parental consent (DPDP). Writes go through the server only. */

async function signedIn(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createClient().catch(() => null);
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  return data?.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

function reply<T extends object>(result: ConsentResult<T>) {
  if (!result.ok) {
    const { status, ...payload } = result;
    return NextResponse.json(payload, { status });
  }
  return NextResponse.json(result);
}

function unavailable() {
  return NextResponse.json({ error: "This isn't available just now.", code: "not_configured" }, { status: 503 });
}

export async function GET(request: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return unavailable();
  const view = request.nextUrl.searchParams.get("view");
  if (view === "children") {
    return NextResponse.json({ ok: true, children: await childrenForParent(admin, user.id) });
  }
  return reply(await childConsentStatus(admin, user.id, indiaToday()));
}

export async function POST(request: NextRequest) {
  const user = await signedIn();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return unavailable();
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const today = indiaToday();

  // Looked up by POST so the link's secret doesn't end up in request logs.
  if (body.action === "lookup") {
    return reply(await consentRequestForParent(admin, typeof body.token === "string" ? body.token : "", user.id));
  }
  if (body.action === "age") {
    const birthMonth = parseBirthMonth(body.birthMonth);
    if (!birthMonth) {
      return NextResponse.json({ error: "Please choose a month and year.", code: "bad_date" }, { status: 400 });
    }
    return reply(await saveBirthMonth(admin, user.id, birthMonth, today));
  }
  if (body.action === "request") {
    const result = await createConsentLink(admin, user.id, today);
    if (!result.ok) return reply(result);
    return NextResponse.json({ ok: true, link: consentLink(request.nextUrl.origin, result.token), expiresAt: result.expiresAt });
  }
  if (body.action === "grant") {
    if (!isRelationship(body.relationship)) {
      return NextResponse.json({ error: "Please choose mother, father or guardian.", code: "bad_relationship" }, { status: 400 });
    }
    return reply(
      await grantConsent(admin, {
        token: typeof body.token === "string" ? body.token : "",
        parentUserId: user.id,
        parentEmail: user.email,
        parentName: typeof body.parentName === "string" ? body.parentName : "",
        relationship: body.relationship,
        declared: body.declared === true,
        today,
      })
    );
  }
  if (body.action === "withdraw") {
    return reply(await withdrawConsent(admin, user.id, typeof body.consentId === "string" ? body.consentId : ""));
  }
  return NextResponse.json({ error: "Unknown request." }, { status: 400 });
}
