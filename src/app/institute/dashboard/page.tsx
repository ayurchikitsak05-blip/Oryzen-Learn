"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileUp,
  Lock,
  PlusCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  Zap,
} from "lucide-react";
import {
  calculatePrakritiProfile,
  DOSHA_STUDY_PRESETS,
  type Dosha,
} from "@/lib/prakriti/config";
import {
  applyExamBoosterPack,
  evaluateAndConsumeQuota,
  EXAM_BOOSTER_PACK_SPEC,
  getOrInitUserQuotaState,
  PLAN_ENTITLEMENTS,
  upgradeUserPlanTier,
  type SubscriptionPlanTier,
  type UserQuotaLedgerState,
} from "@/lib/billing/quotas";
import OryzenLearnBrand from "@/components/brand/OryzenLearnBrand";
import {
  buildDrmSecurityPolicyForAsset,
  DEFAULT_BATCH_ANALYTICS,
  DEFAULT_COACHING_ORGANIZATION,
  DEFAULT_INSTITUTE_BATCH_ASSETS,
  verifySyllabusLockedPrompt,
  type InstituteBatchAsset,
} from "@/lib/institute/drm-portal";

export default function InstituteB2BDashboardPage() {
  const [activeDosha, setActiveDosha] = useState<Dosha>("Pitta");
  const [assets, setAssets] = useState<InstituteBatchAsset[]>(
    () => DEFAULT_INSTITUTE_BATCH_ASSETS
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    DEFAULT_INSTITUTE_BATCH_ASSETS[0].id
  );

  // New Asset Upload Form State
  const [newAssetTitle, setNewAssetTitle] = useState<string>("");
  const [newAssetType, setNewAssetType] = useState<"drm_pdf" | "batch_lecture">(
    "drm_pdf"
  );
  const [newAssetUrlOrPath, setNewAssetUrlOrPath] = useState<string>(
    "orgs/org-horizon-academy-01/mechanics-master.pdf"
  );
  const [newAssetSubject, setNewAssetSubject] = useState<string>("Physics");

  // Dynamic Student Watermark Identity State
  const [studentId, setStudentId] = useState<string>("STU-2026-8841");
  const [studentName, setStudentName] = useState<string>("Ananya Rao");
  const [studentPhone, setStudentPhone] = useState<string>("+91-9876543210");
  const [drmAlertMessage, setDrmAlertMessage] = useState<string | null>(null);

  // Syllabus-Locked AI Tester State
  const [syllabusQuery, setSyllabusQuery] = useState<string>(
    "How does Newton's second law relate force, mass, and acceleration?"
  );
  const [syllabusCheckOutput, setSyllabusCheckOutput] = useState<string | null>(
    null
  );

  // Freemium Quotas & Exam Booster State
  const [quotaState, setQuotaState] = useState<UserQuotaLedgerState>(() =>
    getOrInitUserQuotaState("local-student-scholar")
  );
  const [quotaBanner, setQuotaBanner] = useState<string | null>(null);

  const drmCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const profile = calculatePrakritiProfile(
    activeDosha === "Vata"
      ? { Vata: 70, Pitta: 20, Kapha: 10 }
      : activeDosha === "Pitta"
        ? { Vata: 15, Pitta: 70, Kapha: 15 }
        : { Vata: 10, Pitta: 20, Kapha: 70 },
    activeDosha === "Vata"
      ? { Vata: 70, Pitta: 20, Kapha: 10 }
      : activeDosha === "Pitta"
        ? { Vata: 15, Pitta: 70, Kapha: 15 }
        : { Vata: 10, Pitta: 20, Kapha: 70 }
  );
  const theme = profile.activeConfiguration.theme;

  const activeAsset =
    assets.find((a) => a.id === selectedAssetId) ?? assets[0];

  const drmPolicy = buildDrmSecurityPolicyForAsset({
    asset: activeAsset,
    student: {
      studentId: studentId || "STU-0001",
      studentName: studentName || "Authorized Student",
      phoneNumber: studentPhone || "+91-9000000000",
      organizationId: DEFAULT_COACHING_ORGANIZATION.id,
      organizationSlug: DEFAULT_COACHING_ORGANIZATION.slug,
    },
  });

  // Render DRM-Protected PDF Canvas with baked-in Dynamic Student-ID & Phone Watermark
  useEffect(() => {
    const canvas = drmCanvasRef.current;
    if (!canvas) return;
    canvas.width = 640;
    canvas.height = 420;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 1. Background surface
    ctx.fillStyle = theme.backgroundHex;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Border
    ctx.strokeStyle = theme.accentHex;
    ctx.lineWidth = 2;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);

    // 3. Institute Master Content
    ctx.fillStyle = theme.accentHex;
    ctx.font = "bold 15px sans-serif";
    ctx.fillText(
      `${DEFAULT_COACHING_ORGANIZATION.name} • ${activeAsset.batchName}`,
      30,
      46
    );

    ctx.fillStyle = theme.textPrimaryHex;
    ctx.font = "bold 17px serif";
    ctx.fillText(activeAsset.title.slice(0, 56), 30, 80);

    ctx.font = "13px serif";
    const lines =
      activeAsset.syllabusSubject === "Economics"
        ? [
            `Subject: ${activeAsset.syllabusSubject} (Syllabus-Locked AI Enabled)`,
            "1. Price elasticity compares percent change in quantity with percent change in price.",
            "2. When demand is elastic, a higher price lowers total revenue.",
            "3. Close substitutes and a longer time horizon usually make demand more elastic.",
            "4. All institute pages are dynamically watermarked per student session (Shield 5).",
          ]
        : [
            `Subject: ${activeAsset.syllabusSubject} (Syllabus-Locked AI Enabled)`,
            "1. A net force changes momentum. When mass is constant, F = ma.",
            "2. Action-reaction pairs are equal and opposite, and they act on different objects.",
            "3. On a frictionless incline, acceleration down the slope is g sin(theta).",
            "4. All institute pages are dynamically watermarked per student session (Shield 5).",
          ];
    lines.forEach((line, idx) => {
      ctx.fillText(line, 30, 118 + idx * 28);
    });

    // 4. Diagonal Dynamic Student-ID + Phone Watermark Overlay
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((-22 * Math.PI) / 180);
    ctx.fillStyle = "rgba(185, 28, 28, 0.16)";
    ctx.font = "bold 19px monospace";
    ctx.textAlign = "center";
    ctx.fillText(drmPolicy.watermarkDiagonalText, 0, -25);
    ctx.fillText(drmPolicy.dynamicWatermarkLines[0], 0, 10);
    ctx.fillText(drmPolicy.dynamicWatermarkLines[1], 0, 42);
    ctx.restore();
  }, [activeAsset, drmPolicy, theme]);

  const handlePublishBatchAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAssetTitle.trim()) return;

    const created: InstituteBatchAsset = {
      id: `asset-${Date.now()}`,
      organizationId: DEFAULT_COACHING_ORGANIZATION.id,
      batchName: "Foundation 2027 Cohort",
      assetType: newAssetType,
      title: newAssetTitle.trim(),
      storagePathOrUrl: newAssetUrlOrPath.trim(),
      syllabusSubject: newAssetSubject.trim() || "Core Concepts",
      allowedSyllabusKeywords: [
        newAssetSubject.toLowerCase(),
        "chapter",
        "concept",
        "example",
        "exam",
      ],
      syllabusLockedAi: true,
      drmBlockDownloadAndPrint: true,
      createdAt: new Date().toISOString(),
    };

    setAssets((prev) => [created, ...prev]);
    setSelectedAssetId(created.id);
    setNewAssetTitle("");
    setDrmAlertMessage(
      `Published "${created.title}" to ${created.batchName} with DRM download/print lock and dynamic student watermarking active.`
    );
  };

  const handleBlockedDrmAction = (actionName: string) => {
    setDrmAlertMessage(
      `🔒 DRM Protection Triggered: ${actionName} is strictly disabled for "${activeAsset.title}". Audit logged for Student ID ${studentId} (${studentPhone}).`
    );
  };

  const handleTestSyllabusLock = () => {
    const check = verifySyllabusLockedPrompt({
      asset: activeAsset,
      queryText: syllabusQuery,
    });
    if (check.allowed) {
      setSyllabusCheckOutput(
        `✅ Authorized Syllabus Query: Matches "${activeAsset.syllabusSubject}" curriculum keywords. Routed to Shielded AI Gateway.`
      );
    } else {
      setSyllabusCheckOutput(`⛔ ${check.reason}`);
    }
  };

  const handleTierSwitch = async (tier: SubscriptionPlanTier) => {
    const next = await upgradeUserPlanTier({
      userId: "local-student-scholar",
      newTier: tier,
    });
    setQuotaState({ ...next });
    setQuotaBanner(
      `Switched active plan to ${PLAN_ENTITLEMENTS[tier].displayName} (${PLAN_ENTITLEMENTS[tier].billingCycleLabel}).`
    );
  };

  const handlePurchaseBooster = async () => {
    const next = await applyExamBoosterPack({
      userId: "local-student-scholar",
      packCount: 1,
    });
    setQuotaState({ ...next });
    setQuotaBanner(
      `Added ${EXAM_BOOSTER_PACK_SPEC.label}: +100 AI Explanations & +20 AI Quizzes credited!`
    );
  };

  const handleSimulateQuotaConsume = async (
    resource: "active_pdf" | "ai_explanation" | "ai_quiz"
  ) => {
    const res = await evaluateAndConsumeQuota({
      userId: "local-student-scholar",
      resource,
    });
    setQuotaState({ ...res.state });
    if (res.allowed) {
      setQuotaBanner(
        `Consumed 1 ${resource}${
          res.consumedFromBooster ? " (drawn from Exam Booster Pack)" : ""
        }.`
      );
    } else {
      setQuotaBanner(`⛔ Quota Limit Reached: ${res.reason}`);
    }
  };

  const currentEntitlements = PLAN_ENTITLEMENTS[quotaState.planTier];

  return (
    <div className="min-h-screen bg-canvas text-ink transition-colors duration-200 select-none print:hidden">
      <header className="sticky top-0 z-20 border-b border-line bg-canvas/92 px-4 py-3 backdrop-blur-md md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-4">
            <OryzenLearnBrand subtitle="Your personal learning environment" />
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight md:text-xl">
                {DEFAULT_COACHING_ORGANIZATION.name}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["Vata", "Pitta", "Kapha"] as const).map((dosha) => {
              const selected = activeDosha === dosha;
              return (
                <button
                  key={dosha}
                  type="button"
                  onClick={() => setActiveDosha(dosha)}
                  className="min-h-[44px] rounded-xl border px-3 py-1.5 text-xs font-bold transition"
                  style={{
                    backgroundColor: selected
                      ? theme.accentHex
                      : theme.backgroundHex,
                    color: selected ? "#FFFFFF" : theme.textPrimaryHex,
                    borderColor: selected ? theme.accentHex : theme.borderHex,
                  }}
                >
                  <Sparkles className="mr-1 inline h-3.5 w-3.5" />
                  {dosha} ({DOSHA_STUDY_PRESETS[dosha].theme.backgroundHex})
                </button>
              );
            })}

            <Link
              href="/"
              className="btn-secondary text-xs"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Studio
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 md:px-8">
        {/* SECTION 1: Freemium Metering, Pro / Exam Pass & ₹49 Exam Booster Packs */}
        <section
          data-testid="billing-quotas-section"
          className="space-y-4 rounded-2xl border p-5 md:p-6"
          style={{
            backgroundColor: theme.surfaceHex,
            borderColor: theme.borderHex,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: theme.borderHex }}>
            <div>
              <h2 className="flex items-center gap-2 text-base font-bold md:text-lg">
                <Zap
                  className="h-5 w-5"
                  style={{ color: theme.accentHex }}
                />
                B2C Freemium Quotas, Pro / Exam Pass &amp; ₹49 Exam Booster Top-Up
              </h2>
              <p
                className="text-xs"
                style={{ color: theme.textSecondaryHex }}
              >
                Free: 3 PDFs and a small daily AI meter. Paid plans raise PDF
                limits and keep AI metered. Do not treat 150 explanations/day as
                a supported volume until cost-backed approval. Booster (₹49) is a
                top-up, not a volume promise.
              </p>
            </div>

            <button
              type="button"
              data-testid="buy-booster-pack-btn"
              onClick={handlePurchaseBooster}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: theme.accentHex }}
            >
              <PlusCircle className="h-4 w-4" />
              Buy Exam Booster Top-Up (₹49: +100 Explanations + 20 Quizzes)
            </button>
          </div>

          {/* Plan Switcher Cards */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(["free", "pro_monthly", "exam_pass_6mo"] as const).map((tier) => {
              const spec = PLAN_ENTITLEMENTS[tier];
              const isCurrent = quotaState.planTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  data-testid={`select-plan-${tier}`}
                  onClick={() => handleTierSwitch(tier)}
                  className="flex min-h-[84px] flex-col justify-between rounded-xl border p-4 text-left transition"
                  style={{
                    backgroundColor: isCurrent
                      ? theme.accentHex
                      : theme.backgroundHex,
                    color: isCurrent ? "#FFFFFF" : theme.textPrimaryHex,
                    borderColor: isCurrent ? theme.accentHex : theme.borderHex,
                  }}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-sm font-bold">{spec.displayName}</span>
                    <span className="font-mono text-xs font-extrabold">
                      {spec.billingCycleLabel}
                    </span>
                  </div>
                  <div className="mt-2 text-xs opacity-90">
                    Max {spec.maxActivePdfs} PDFs • Metered AI explanations
                    {spec.dailyAiQuizzesLimit === null
                      ? " • Quizzes stay available"
                      : ` • ${spec.dailyAiQuizzesLimit} quiz/day`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Live Quota Meter Counters & Simulator Buttons */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div
              className="rounded-xl border p-3.5 text-xs"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="font-bold">Active PDFs Uploaded</div>
              <div className="mt-1 font-mono text-base font-extrabold">
                {quotaState.activePdfCount} / {currentEntitlements.maxActivePdfs}
              </div>
              <button
                type="button"
                onClick={() => handleSimulateQuotaConsume("active_pdf")}
                className="mt-2 min-h-[40px] w-full rounded-lg border px-2.5 py-1 font-bold"
                style={{
                  backgroundColor: theme.surfaceHex,
                  borderColor: theme.borderHex,
                }}
              >
                +1 Active PDF
              </button>
            </div>

            <div
              className="rounded-xl border p-3.5 text-xs"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="font-bold">Grounded AI Explanations Today</div>
              <div className="mt-1 font-mono text-base font-extrabold">
                {quotaState.dailyExplanationsUsed} /{" "}
                {currentEntitlements.dailyAiExplanationsLimit}
              </div>
              <button
                type="button"
                onClick={() => handleSimulateQuotaConsume("ai_explanation")}
                className="mt-2 min-h-[40px] w-full rounded-lg border px-2.5 py-1 font-bold"
                style={{
                  backgroundColor: theme.surfaceHex,
                  borderColor: theme.borderHex,
                }}
              >
                +1 AI Explanation
              </button>
            </div>

            <div
              className="rounded-xl border p-3.5 text-xs"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="font-bold">AI Quizzes Generated Today</div>
              <div className="mt-1 font-mono text-base font-extrabold">
                {quotaState.dailyQuizzesUsed} /{" "}
                {currentEntitlements.dailyAiQuizzesLimit === null
                  ? "∞ Unlimited"
                  : currentEntitlements.dailyAiQuizzesLimit}
              </div>
              <button
                type="button"
                onClick={() => handleSimulateQuotaConsume("ai_quiz")}
                className="mt-2 min-h-[40px] w-full rounded-lg border px-2.5 py-1 font-bold"
                style={{
                  backgroundColor: theme.surfaceHex,
                  borderColor: theme.borderHex,
                }}
              >
                +1 AI Quiz
              </button>
            </div>

            <div
              className="rounded-xl border p-3.5 text-xs"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="font-bold">Exam Booster Balance (₹49 Packs)</div>
              <div className="mt-1 font-mono text-xs font-extrabold">
                +{quotaState.boosterExplanationsRemaining} Explanations
                <br />+{quotaState.boosterQuizzesRemaining} Quizzes
              </div>
              <div className="mt-2 font-mono text-[11px] opacity-75">
                Packs Purchased: {quotaState.boosterPacksPurchased}
              </div>
            </div>
          </div>

          {quotaBanner && (
            <div
              className="rounded-xl border px-4 py-2.5 text-xs font-semibold"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.accentHex,
              }}
            >
              {quotaBanner}
            </div>
          )}
        </section>

        {/* SECTION 2: Coaching Institute Admin Upload & DRM Watermarked Viewer */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Upload Master Authorized PDFs & Batch Lecture Links + Syllabus Lock */}
          <section
            className="space-y-5 rounded-2xl border p-5 lg:col-span-5"
            style={{
              backgroundColor: theme.surfaceHex,
              borderColor: theme.borderHex,
            }}
          >
            <h2 className="flex items-center gap-2 text-base font-bold">
              <FileUp
                className="h-5 w-5"
                style={{ color: theme.accentHex }}
              />
              Institute Director: Distribute Master PDF &amp; Batch Lecture
            </h2>

            <form onSubmit={handlePublishBatchAsset} className="space-y-3">
              <div>
                <label
                  htmlFor="asset-title"
                  className="mb-1 block text-xs font-bold uppercase tracking-wider"
                >
                  Authorized Asset Title
                </label>
                <input
                  id="asset-title"
                  type="text"
                  required
                  placeholder="e.g., Linear Algebra Problem Sets Vol 2"
                  value={newAssetTitle}
                  onChange={(e) => setNewAssetTitle(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border px-3.5 text-xs font-medium"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNewAssetType("drm_pdf")}
                  className="min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold"
                  style={{
                    backgroundColor:
                      newAssetType === "drm_pdf"
                        ? theme.accentHex
                        : theme.backgroundHex,
                    color:
                      newAssetType === "drm_pdf"
                        ? "#FFFFFF"
                        : theme.textPrimaryHex,
                    borderColor: theme.borderHex,
                  }}
                >
                  DRM Master PDF
                </button>
                <button
                  type="button"
                  onClick={() => setNewAssetType("batch_lecture")}
                  className="min-h-[44px] rounded-xl border px-3 py-2 text-xs font-bold"
                  style={{
                    backgroundColor:
                      newAssetType === "batch_lecture"
                        ? theme.accentHex
                        : theme.backgroundHex,
                    color:
                      newAssetType === "batch_lecture"
                        ? "#FFFFFF"
                        : theme.textPrimaryHex,
                    borderColor: theme.borderHex,
                  }}
                >
                  Batch Lecture Link
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input
                  type="text"
                  aria-label="Storage Path or Lecture URL"
                  value={newAssetUrlOrPath}
                  onChange={(e) => setNewAssetUrlOrPath(e.target.value)}
                  className="min-h-[44px] rounded-xl border px-3 font-mono text-xs"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
                <input
                  type="text"
                  aria-label="Syllabus Subject"
                  value={newAssetSubject}
                  onChange={(e) => setNewAssetSubject(e.target.value)}
                  className="min-h-[44px] rounded-xl border px-3 text-xs font-semibold"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
              </div>

              <button
                type="submit"
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white"
                style={{ backgroundColor: theme.accentHex }}
              >
                <CheckCircle2 className="h-4 w-4" />
                Publish DRM-Protected Batch Asset to Cohort
              </button>
            </form>

            {/* Published Batch Assets List */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-bold uppercase tracking-wider opacity-75">
                Active Cohort Assets ({assets.length}):
              </div>
              {assets.map((asset) => {
                const isSelected = asset.id === activeAsset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelectedAssetId(asset.id)}
                    className="flex min-h-[52px] w-full items-center justify-between rounded-xl border p-3 text-left text-xs transition"
                    style={{
                      backgroundColor: isSelected
                        ? theme.accentHex
                        : theme.backgroundHex,
                      color: isSelected ? "#FFFFFF" : theme.textPrimaryHex,
                      borderColor: isSelected
                        ? theme.accentHex
                        : theme.borderHex,
                    }}
                  >
                    <div>
                      <div className="font-bold">{asset.title}</div>
                      <div className="font-mono text-[11px] opacity-85">
                        {asset.batchName} • {asset.syllabusSubject} •{" "}
                        {asset.assetType === "drm_pdf"
                          ? "DRM PDF"
                          : "Batch Video"}
                      </div>
                    </div>
                    {asset.assetType === "drm_pdf" ? (
                      <Lock className="h-4 w-4 shrink-0" />
                    ) : (
                      <Video className="h-4 w-4 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Syllabus-Locked AI Distribution Guardrail Tester */}
            <div
              className="space-y-2.5 rounded-xl border p-4"
              style={{
                backgroundColor: theme.backgroundHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="flex items-center gap-1.5 text-xs font-bold">
                <ShieldCheck
                  className="h-4 w-4"
                  style={{ color: theme.accentHex }}
                />
                Syllabus-Locked AI Guardrail ({activeAsset.syllabusSubject})
              </div>
              <input
                type="text"
                aria-label="Test Syllabus-Locked Query"
                value={syllabusQuery}
                onChange={(e) => setSyllabusQuery(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border px-3 text-xs"
                style={{
                  backgroundColor: theme.surfaceHex,
                  borderColor: theme.borderHex,
                }}
              />
              <button
                type="button"
                onClick={handleTestSyllabusLock}
                className="min-h-[44px] w-full rounded-xl border px-3 py-2 text-xs font-bold"
                style={{
                  backgroundColor: theme.surfaceHex,
                  borderColor: theme.borderHex,
                }}
              >
                Verify Syllabus-Locked Prompt
              </button>
              {syllabusCheckOutput && (
                <p className="text-xs font-semibold">{syllabusCheckOutput}</p>
              )}
            </div>
          </section>

          {/* Right Column: Dynamic Student-ID & Phone Watermarked DRM Canvas + Batch Analytics */}
          <section className="space-y-6 lg:col-span-7">
            <div
              data-testid="drm-watermarked-viewer"
              onContextMenu={(e) => {
                e.preventDefault();
                handleBlockedDrmAction("Right-Click Context Menu / Save-As");
              }}
              className="space-y-4 rounded-2xl border p-5"
              style={{
                backgroundColor: theme.surfaceHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider opacity-75">
                    DRM-Protected &amp; Dynamically Watermarked Canvas
                  </span>
                  <h3 className="flex items-center gap-2 text-base font-bold">
                    <Lock
                      className="h-4 w-4"
                      style={{ color: theme.accentHex }}
                    />
                    {activeAsset.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="drm-attempt-download-btn"
                    onClick={() =>
                      handleBlockedDrmAction("Local PDF File Download")
                    }
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-700/40 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Download Blocked (DRM)
                  </button>
                  <button
                    type="button"
                    data-testid="drm-attempt-print-btn"
                    onClick={() => handleBlockedDrmAction("Document Printing")}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-700/40 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900"
                  >
                    <ShieldAlert className="h-4 w-4" />
                    Print Blocked (DRM)
                  </button>
                </div>
              </div>

              {/* Dynamic Student Watermark Controls */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <input
                  type="text"
                  aria-label="Watermark Student ID"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  className="min-h-[44px] rounded-xl border px-3 font-mono text-xs font-bold"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
                <input
                  type="text"
                  aria-label="Watermark Student Name"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="min-h-[44px] rounded-xl border px-3 text-xs font-semibold"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
                <input
                  type="text"
                  aria-label="Watermark Student Phone"
                  value={studentPhone}
                  onChange={(e) => setStudentPhone(e.target.value)}
                  className="min-h-[44px] rounded-xl border px-3 font-mono text-xs font-bold"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                />
              </div>

              {drmAlertMessage && (
                <div className="rounded-xl border border-line bg-beige-2 p-3 text-xs font-semibold text-heading">
                  {drmAlertMessage}
                </div>
              )}

              {/* Watermarked Canvas Surface */}
              <div
                className="relative overflow-hidden rounded-xl border bg-white/70 p-2 flex justify-center"
                style={{ borderColor: theme.borderHex }}
              >
                <canvas
                  ref={drmCanvasRef}
                  aria-label="DRM Watermarked Institute PDF Canvas"
                  className="max-w-full rounded-lg"
                />
                {/* Pointer-events-none DOM overlay reinforcing canvas watermark */}
                <div
                  data-testid="dynamic-watermark-overlay"
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between p-4 font-mono text-[11px] font-bold text-red-900/50"
                >
                  <span>{drmPolicy.dynamicWatermarkLines[0]}</span>
                  <span>{drmPolicy.dynamicWatermarkLines[1]}</span>
                </div>
              </div>
            </div>

            {/* Cohort Batch Analytics Card */}
            <div
              data-testid="institute-batch-analytics"
              className="space-y-4 rounded-2xl border p-5"
              style={{
                backgroundColor: theme.surfaceHex,
                borderColor: theme.borderHex,
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-base font-bold">
                  <BarChart3
                    className="h-5 w-5"
                    style={{ color: theme.accentHex }}
                  />
                  Cohort Analytics: {DEFAULT_BATCH_ANALYTICS.batchName}
                </h3>
                <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold">
                  <Users className="h-4 w-4" />
                  {DEFAULT_BATCH_ANALYTICS.enrolledStudents} Enrolled Scholars
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div
                  className="rounded-xl border p-3.5 text-xs"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                >
                  <div className="font-semibold opacity-75">
                    Avg Reading Completion
                  </div>
                  <div className="mt-1 text-2xl font-extrabold">
                    {DEFAULT_BATCH_ANALYTICS.averageCompletionPercent}%
                  </div>
                </div>
                <div
                  className="rounded-xl border p-3.5 text-xs"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                >
                  <div className="font-semibold opacity-75">
                    Avg Test-Me Quiz Accuracy
                  </div>
                  <div className="mt-1 text-2xl font-extrabold">
                    {DEFAULT_BATCH_ANALYTICS.averageQuizAccuracyPercent}%
                  </div>
                </div>
                <div
                  className="rounded-xl border p-3.5 text-xs"
                  style={{
                    backgroundColor: theme.backgroundHex,
                    borderColor: theme.borderHex,
                  }}
                >
                  <div className="font-semibold opacity-75">
                    Learning Profile Cohort Split
                  </div>
                  <div className="mt-1 font-mono text-xs font-bold">
                    V: {DEFAULT_BATCH_ANALYTICS.prakritiCohortDistribution.Vata}
                    % • P:{" "}
                    {DEFAULT_BATCH_ANALYTICS.prakritiCohortDistribution.Pitta}%
                    • K:{" "}
                    {DEFAULT_BATCH_ANALYTICS.prakritiCohortDistribution.Kapha}%
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider opacity-80">
                  High-Friction Paragraphs &amp; Lecture Rewind Hotspots:
                </div>
                {DEFAULT_BATCH_ANALYTICS.highFrictionTopics.map((item) => (
                  <div
                    key={item.topic}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-xs"
                    style={{
                      backgroundColor: theme.backgroundHex,
                      borderColor: theme.borderHex,
                    }}
                  >
                    <span className="font-bold">{item.topic}</span>
                    <span className="font-mono">
                      {item.pageOrTimestamp} • {item.rewindOrHighlightCount}{" "}
                      signals
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
