/**
 * Layer 5: B2B Coaching Institute Multi-Tenant Portal, DRM Protection & Dynamic Watermarking
 *
 * Activates the `organizations` schema from Layer 1:
 * - Master authorized PDF & batch lecture distribution per organization/cohort
 * - Strict DRM enforcement (blocking local file download, printing, and clipboard extraction)
 * - Dynamic Student-ID + Phone Number watermark overlay rendered directly over the PDF canvas
 * - Syllabus-locked AI query guardrails and batch cohort analytics
 */

export interface CoachingOrganization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
}

export interface StudentWatermarkIdentity {
  studentId: string;
  studentName: string;
  phoneNumber: string;
  organizationId: string;
  organizationSlug: string;
}

export interface DrmSecurityPolicy {
  blockLocalDownload: boolean;
  blockPrint: boolean;
  blockContextMenuAndCopy: boolean;
  dynamicWatermarkLines: [string, string];
  watermarkDiagonalText: string;
}

export interface InstituteBatchAsset {
  id: string;
  organizationId: string;
  batchName: string;
  assetType: "drm_pdf" | "batch_lecture";
  title: string;
  storagePathOrUrl: string;
  syllabusSubject: string;
  allowedSyllabusKeywords: string[];
  syllabusLockedAi: boolean;
  drmBlockDownloadAndPrint: boolean;
  createdAt: string;
}

export interface InstituteBatchAnalytics {
  organizationId: string;
  batchName: string;
  enrolledStudents: number;
  averageCompletionPercent: number;
  averageQuizAccuracyPercent: number;
  highFrictionTopics: Array<{
    topic: string;
    pageOrTimestamp: string;
    rewindOrHighlightCount: number;
  }>;
  prakritiCohortDistribution: {
    Vata: number;
    Pitta: number;
    Kapha: number;
  };
}

export const DEFAULT_COACHING_ORGANIZATION: CoachingOrganization = {
  id: "org-horizon-academy-01",
  name: "Horizon Multi-Faculty Coaching Academy",
  slug: "horizon-academy",
  createdAt: "2026-10-20T08:00:00.000Z",
};

export const DEFAULT_INSTITUTE_BATCH_ASSETS: InstituteBatchAsset[] = [
  {
    id: "asset-drm-pdf-1",
    organizationId: DEFAULT_COACHING_ORGANIZATION.id,
    batchName: "Foundation 2027 Cohort",
    assetType: "drm_pdf",
    title: "Mechanics Master Notes — Forces, Energy & Momentum (DRM Protected)",
    storagePathOrUrl: "orgs/org-horizon-academy-01/mechanics-master.pdf",
    syllabusSubject: "Physics",
    allowedSyllabusKeywords: [
      "force",
      "mass",
      "acceleration",
      "newton",
      "momentum",
      "inertia",
      "energy",
      "vector",
      "motion",
    ],
    syllabusLockedAi: true,
    drmBlockDownloadAndPrint: true,
    createdAt: "2026-10-20T09:00:00.000Z",
  },
  {
    id: "asset-batch-lec-1",
    organizationId: DEFAULT_COACHING_ORGANIZATION.id,
    batchName: "Foundation 2027 Cohort",
    assetType: "batch_lecture",
    title: "Batch Lecture 14: Price Elasticity of Demand",
    storagePathOrUrl: "https://www.youtube.com/watch?v=M7lc1UVf-VE",
    syllabusSubject: "Economics",
    allowedSyllabusKeywords: [
      "elasticity",
      "demand",
      "supply",
      "price",
      "revenue",
      "income",
    ],
    syllabusLockedAi: true,
    drmBlockDownloadAndPrint: true,
    createdAt: "2026-10-20T09:30:00.000Z",
  },
];

export const DEFAULT_BATCH_ANALYTICS: InstituteBatchAnalytics = {
  organizationId: DEFAULT_COACHING_ORGANIZATION.id,
  batchName: "Foundation 2027 Cohort",
  enrolledStudents: 480,
  averageCompletionPercent: 78.4,
  averageQuizAccuracyPercent: 84.2,
  highFrictionTopics: [
    {
      topic: "Free-body diagrams for Newton's third law",
      pageOrTimestamp: "Page 42 • [04:18]",
      rewindOrHighlightCount: 312,
    },
    {
      topic: "Elasticity versus slope of the demand curve",
      pageOrTimestamp: "Page 88 • [11:45]",
      rewindOrHighlightCount: 245,
    },
  ],
  prakritiCohortDistribution: {
    Vata: 38,
    Pitta: 42,
    Kapha: 20,
  },
};

/**
 * Formats the dynamic anti-piracy student watermark strings containing the student's ID,
 * masked/full phone number, organization slug, and UTC date stamp.
 */
export function buildDrmSecurityPolicyForAsset(params: {
  asset: InstituteBatchAsset;
  student: StudentWatermarkIdentity;
  timestampIso?: string;
}): DrmSecurityPolicy {
  const { asset, student } = params;

  if (student.organizationId !== asset.organizationId) {
    throw new Error(
      `Access Denied: Student organization (${student.organizationId}) is not authorized for institute asset (${asset.organizationId}).`
    );
  }

  if (!student.studentId.trim() || !student.phoneNumber.trim()) {
    throw new Error(
      "DRM Watermark requires both a non-empty studentId and phoneNumber."
    );
  }

  const datePart = (params.timestampIso ?? new Date().toISOString()).slice(
    0,
    10
  );
  const line1 = `DRM LICENSED TO: ${student.studentName.toUpperCase()} (${student.studentId})`;
  const line2 = `PHONE: ${student.phoneNumber} • ORG: ${student.organizationSlug.toUpperCase()} • ${datePart}`;
  const diagonal = `${student.studentId} • ${student.phoneNumber} • DO NOT DISTRIBUTE`;

  return {
    blockLocalDownload: asset.drmBlockDownloadAndPrint,
    blockPrint: asset.drmBlockDownloadAndPrint,
    blockContextMenuAndCopy: asset.drmBlockDownloadAndPrint,
    dynamicWatermarkLines: [line1, line2],
    watermarkDiagonalText: diagonal,
  };
}

/**
 * Enforces Syllabus-Locked AI Distribution for B2B Coaching Institute batches:
 * When `syllabusLockedAi` is enabled on an institute asset, off-syllabus prompts
 * are rejected so institute AI budgets remain strictly focused on the batch curriculum.
 */
export function verifySyllabusLockedPrompt(params: {
  asset: InstituteBatchAsset;
  queryText: string;
}): { allowed: boolean; reason?: string } {
  const { asset, queryText } = params;
  if (!asset.syllabusLockedAi) {
    return { allowed: true };
  }

  const normalizedQuery = queryText.toLowerCase();
  const hasMatch = asset.allowedSyllabusKeywords.some((kw) =>
    normalizedQuery.includes(kw.toLowerCase())
  );

  if (!hasMatch) {
    return {
      allowed: false,
      reason: `Syllabus-Locked AI Guardrail: Query is outside the authorized "${asset.syllabusSubject}" batch syllabus (${asset.batchName}).`,
    };
  }

  return { allowed: true };
}
