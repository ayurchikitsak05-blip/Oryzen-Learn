import type {
  CalculatedPrakritiProfile,
  DoshaScores,
} from "@/lib/prakriti/config";

export type DeviceCategory = "tablet" | "phone";

export interface StoredPrakritiProfilePayload {
  version: 1;
  completedAt: string;
  basicScores: DoshaScores;
  readingScores: DoshaScores;
  calculated: CalculatedPrakritiProfile;
  themePreference: CalculatedPrakritiProfile["activeConfiguration"]["theme"]["cssVariable"];
}

export interface CognitiveDnaCardJson {
  summary_text: string;
  word_count: number;
  primary_dosha: string;
  classification: string;
  preferred_lens: string;
  signals: {
    detail_additions: number;
    simplifications: number;
    illustrative_requests: number;
    video_rewind_count: number;
  };
  generated_at: string;
}

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  prakriti_profile: StoredPrakritiProfilePayload | null;
  role?: "student" | "instructor" | "admin";
  access_status?: "none" | "active_paid" | "class_sponsored" | "trial" | "revoked";
  access_granted_at?: string | null;
  sponsored_code_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  file_hash: string;
  file_size: number;
  storage_path: string;
  page_count: number;
  created_at: string;
}

export interface StudentCognitiveMemoryRow {
  id: string;
  user_id: string;
  cognitive_dna_summary: CognitiveDnaCardJson;
  updated_at: string;
}

export interface ActiveDeviceSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  device_type: DeviceCategory;
  device_label: string | null;
  session_token_hash: string;
  is_revoked: boolean;
  last_active_at: string;
  created_at: string;
}
