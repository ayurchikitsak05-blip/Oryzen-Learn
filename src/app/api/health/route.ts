import { NextResponse } from "next/server";
import { DOSHA_STUDY_PRESETS } from "@/lib/prakriti/config";
import { AUTHORIZED_DOCUMENTS_BUCKET } from "@/lib/supabase/storage";
import { MAX_ACTIVE_DEVICES_PER_USER } from "@/lib/supabase/device-lock";
import {
  SHIELD_1_MAX_PROMPT_TOKENS,
  SHIELD_4_DEFAULT_WALLET_CAP_INR,
} from "@/lib/ai/gateway";
import { MAX_COGNITIVE_DNA_WORDS } from "@/lib/ai/adaptive-memory";
import { PLAN_ENTITLEMENTS } from "@/lib/billing/quotas";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    layer: 5,
    activeLayerName: "Layer 5",
    timestamp: new Date().toISOString(),
    prakritiEngineReady: true,
    pdfEngineReady: true,
    aiGatewayReady: true,
    parallelVideoStudioReady: true,
    synthesisStudioReady: true,
    adaptiveMemoryReady: true,
    freemiumMeteringReady: true,
    instituteB2bDrmPortalReady: true,
    cognitiveDnaMaxWords: MAX_COGNITIVE_DNA_WORDS,
    virtualizedRamWindowPages: 3,
    shield1MaxPromptTokens: SHIELD_1_MAX_PROMPT_TOKENS,
    shield4WalletCapInr: SHIELD_4_DEFAULT_WALLET_CAP_INR,
    deviceLockMaxDevices: MAX_ACTIVE_DEVICES_PER_USER,
    privateStorageBucket: AUTHORIZED_DOCUMENTS_BUCKET,
    availablePlans: Object.keys(PLAN_ENTITLEMENTS),
    availableProfiles: Object.keys(DOSHA_STUDY_PRESETS),
    dwandwajaProfiles: ["Vata-Pitta", "Pitta-Kapha", "Vata-Kapha"],
  });
}
