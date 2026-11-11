import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applySubscription,
  createSubscription,
  handleWebhookEvent,
  proUntilFor,
  razorpayPlanId,
  subscriptionSignature,
  webhookSignatureValid,
} from "../subscription";
import { proHasExpired } from "../pro-expiry";

type Row = Record<string, unknown>;

function fakeDb(profiles: Row[]) {
  const tables: Record<string, Row[]> = { profiles, razorpay_events: [] };
  const from = (name: string) => {
    const filters: Array<(row: Row) => boolean> = [];
    let patch: Row | null = null;
    const rows = () => tables[name].filter((row) => filters.every((f) => f(row)));
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push((row) => row[column] === value);
        return chain;
      },
      update: (next: Row) => {
        patch = next;
        return chain;
      },
      insert: async (row: Row) => {
        if (name === "razorpay_events" && tables.razorpay_events.some((r) => r.event_id === row.event_id)) {
          return { error: { message: "duplicate key", code: "23505" } };
        }
        tables[name].push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (column: string, value: unknown) => {
          tables[name] = tables[name].filter((row) => row[column] !== value);
          return { error: null };
        },
      }),
      maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => void) => {
        if (patch) rows().forEach((row) => Object.assign(row, patch));
        resolve({ data: null, error: null });
      },
    };
    return chain;
  };
  return { admin: { from } as unknown as SupabaseClient, tables };
}

const now = new Date("2026-11-12T00:00:00Z");
const monthEnd = Math.floor(new Date("2026-12-12T00:00:00Z").getTime() / 1000);

describe("monthly auto-renew", () => {
  it("checks Razorpay's signatures", () => {
    const sig = createHmac("sha256", "s3cret").update("pay_1|sub_1").digest("hex");
    expect(subscriptionSignature("pay_1", "sub_1", "s3cret")).toBe(sig);
    const body = JSON.stringify({ event: "subscription.charged" });
    const good = createHmac("sha256", "hook").update(body).digest("hex");
    expect(webhookSignatureValid(body, good, "hook")).toBe(true);
    expect(webhookSignatureValid(body, good, "other")).toBe(false);
    expect(webhookSignatureValid(body, null, "hook")).toBe(false);
  });

  it("pays Pro until the end of the charged month plus two days", () => {
    expect(proUntilFor({ current_end: monthEnd }, now).toISOString()).toBe("2026-12-14T00:00:00.000Z");
    expect(proUntilFor({ current_end: null }, now).toISOString()).toBe("2026-12-15T00:00:00.000Z");
    expect(razorpayPlanId({ RAZORPAY_PLAN_ID: "plan_ABC" } as unknown as NodeJS.ProcessEnv)).toBe("plan_ABC");
    expect(razorpayPlanId({ RAZORPAY_PLAN_ID: "oops" } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it("makes a subscription tagged with the student", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "sub_9", status: "created" }), { status: 200 }));
    const made = await createSubscription({ keys: { keyId: "k", secret: "s" }, planId: "plan_1", userId: "u1", fetchImpl });
    expect(made?.id).toBe("sub_9");
    const sent = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(sent).toMatchObject({ plan_id: "plan_1", notes: { user_id: "u1" }, total_count: 120 });
  });

  it("turns Pro on when charged and never moves the end date back", async () => {
    const { admin, tables } = fakeDb([{ id: "u1", access_status: "trial", pro_until: "2027-01-31T00:00:00Z", razorpay_subscription_id: null }]);
    await applySubscription(admin, { userId: "u1", subscription: { id: "sub_1", status: "active", current_end: monthEnd }, charged: true, now });
    expect(tables.profiles[0]).toMatchObject({ access_status: "active_paid", pro_until: "2027-01-31T00:00:00.000Z", razorpay_subscription_id: "sub_1" });
  });

  it("applies each Razorpay notice once, for the right student", async () => {
    const { admin, tables } = fakeDb([{ id: "u1", access_status: "trial", pro_until: null, razorpay_subscription_id: "sub_1" }]);
    const body = {
      event: "subscription.charged",
      payload: { subscription: { entity: { id: "sub_1", status: "active", current_end: monthEnd, notes: { user_id: "u1" } } } },
    };
    expect(await handleWebhookEvent(admin, { eventId: "evt_1", body, now })).toBe("applied");
    expect(tables.profiles[0]).toMatchObject({ access_status: "active_paid", pro_until: "2026-12-14T00:00:00.000Z" });
    expect(await handleWebhookEvent(admin, { eventId: "evt_1", body, now })).toBe("duplicate");
    const stranger = { ...body, payload: { subscription: { entity: { ...body.payload.subscription.entity, notes: { user_id: "nobody" } } } } };
    expect(await handleWebhookEvent(admin, { eventId: "evt_2", body: stranger, now })).toBe("unknown_student");
    expect(tables.razorpay_events.map((row) => row.event_id)).toEqual(["evt_1"]);
    expect(await handleWebhookEvent(admin, { eventId: "evt_3", body: { event: "payment.captured" }, now })).toBe("ignored");
  });

  it("keeps Pro until the paid date after cancelling, then expires it", async () => {
    const { admin, tables } = fakeDb([{ id: "u1", access_status: "active_paid", pro_until: "2026-12-14T00:00:00Z", razorpay_subscription_id: "sub_1" }]);
    const body = {
      event: "subscription.cancelled",
      payload: { subscription: { entity: { id: "sub_1", status: "cancelled", current_end: monthEnd, notes: { user_id: "u1" } } } },
    };
    await handleWebhookEvent(admin, { eventId: "evt_c", body, now });
    expect(tables.profiles[0]).toMatchObject({ access_status: "active_paid", subscription_status: "cancelled", pro_until: "2026-12-14T00:00:00Z" });
    expect(proHasExpired(tables.profiles[0], new Date("2026-12-13T00:00:00Z"))).toBe(false);
    expect(proHasExpired(tables.profiles[0], new Date("2026-12-15T00:00:00Z"))).toBe(true);
    expect(proHasExpired({ access_status: "active_paid", pro_until: null })).toBe(false);
    expect(proHasExpired({ access_status: "class_sponsored", pro_until: "2020-01-01T00:00:00Z" })).toBe(false);
  });

  it("records a status notice about an old subscription without replacing the current one", async () => {
    const { admin, tables } = fakeDb([{ id: "u1", access_status: "active_paid", pro_until: "2026-12-14T00:00:00Z", razorpay_subscription_id: "sub_new", subscription_status: "active" }]);
    const body = {
      event: "subscription.halted",
      payload: { subscription: { entity: { id: "sub_old", status: "halted", notes: { user_id: "u1" } } } },
    };
    expect(await handleWebhookEvent(admin, { eventId: "evt_h", body, now })).toBe("applied");
    expect(tables.profiles[0]).toMatchObject({ razorpay_subscription_id: "sub_new", subscription_status: "active" });
  });
});
