export const EXPERIENCE_IDS = ["focus", "studio", "momentum"] as const;

export type ExperienceId = (typeof EXPERIENCE_IDS)[number];

export interface ExperiencePrefs {
  version: 1;
  ownerId: string | null;
  experience: ExperienceId;
  usePrakritiAccent: boolean;
  decorations: boolean;
  animations: boolean;
  rewards: boolean;
}

export interface ExperienceTokens {
  bg: string;
  bgSecondary: string;
  card: string;
  beigePrimary: string;
  beigeSecondary: string;
  selected: string;
  heading: string;
  body: string;
  textSecondary: string;
  borders: string;
  accent: string;
  focusRing: string;
  danger: string;
  dangerBg: string;
  success: string;
  successBg: string;
}

export const EXPERIENCE_STORAGE_KEY = "oryzen_visual_experience_v1";
