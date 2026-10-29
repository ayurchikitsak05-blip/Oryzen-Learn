import {
  flushAccountVault,
  isAccountVaultUnlocked,
  privateAccessAllowed,
  readPrivateString,
  writePrivateString,
} from "@/lib/privacy/account-vault";
import { READINESS_FEELINGS, type ReadinessFeeling } from "./check-in";
import type { LearningEvaluation } from "./rewards";

export const WORLD_STORAGE_KEY = "oryzen_learning_world_v1";

const BACKGROUNDS = ["paper", "dusk", "meadow"] as const;
const DESKS = ["plain", "books"] as const;
const WALLS = ["clear", "notes"] as const;
const PET_ACCESSORIES = ["none", "ribbon", "satchel"] as const;
const COMPANION_ACCESSORIES = ["none", "ribbon", "pin"] as const;

export type RoomBackground = (typeof BACKGROUNDS)[number];
export type RoomDesk = (typeof DESKS)[number];
export type RoomWall = (typeof WALLS)[number];
export type PetAccessory = (typeof PET_ACCESSORIES)[number];
export type CompanionAccessory = (typeof COMPANION_ACCESSORIES)[number];

export interface ReadinessEntry {
  date: string;
  feeling: ReadinessFeeling;
}

export interface LearningWorld {
  version: 1;
  ownerId: string | null;
  petName: string;
  petAccessory: PetAccessory;
  companionAccessory: CompanionAccessory;
  background: RoomBackground;
  desk: RoomDesk;
  wall: RoomWall;
  placedStickerIds: string[];
  shownBadgeIds: string[];
  selectedTitleId: string | null;
  favoriteStickerId: string | null;
  readiness: ReadinessEntry[];
}

export function defaultLearningWorld(ownerId: string | null): LearningWorld {
  return {
    version: 1,
    ownerId,
    petName: "",
    petAccessory: "none",
    companionAccessory: "none",
    background: "paper",
    desk: "plain",
    wall: "clear",
    placedStickerIds: [],
    shownBadgeIds: [],
    selectedTitleId: null,
    favoriteStickerId: null,
    readiness: [],
  };
}

function inList<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function keepIds(value: unknown, allowed: ReadonlySet<string>, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || !allowed.has(entry) || ids.includes(entry)) continue;
    ids.push(entry);
    if (ids.length >= limit) break;
  }
  return ids;
}

export function sanitizeLearningWorld(
  value: unknown,
  ownerId: string | null,
  evaluation: Pick<
    LearningEvaluation,
    "stickers" | "badges" | "titles" | "backgrounds" | "desks" | "walls" | "petAccessories" | "companionAccessories"
  >
): LearningWorld {
  const raw = value && typeof value === "object" ? (value as Partial<LearningWorld>) : {};
  const stickers = new Set(evaluation.stickers.filter((item) => item.earned).map((item) => item.id));
  const badges = new Set(evaluation.badges.filter((item) => item.earned).map((item) => item.id));
  const titles = new Set(evaluation.titles.filter((item) => item.earned).map((item) => item.id));
  const backgrounds = new Set(evaluation.backgrounds);
  const desks = new Set(evaluation.desks);
  const walls = new Set(evaluation.walls);
  const petAccessories = new Set(evaluation.petAccessories);
  const companionAccessories = new Set(evaluation.companionAccessories);
  const feelings = new Set(READINESS_FEELINGS.map((item) => item.id));
  const readiness: ReadinessEntry[] = [];
  if (Array.isArray(raw.readiness)) {
    for (const entry of raw.readiness) {
      if (!entry || typeof entry !== "object") continue;
      const date = "date" in entry && typeof entry.date === "string" ? entry.date : "";
      const feeling = "feeling" in entry ? entry.feeling : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !feelings.has(feeling as ReadinessFeeling)) continue;
      const index = readiness.findIndex((item) => item.date === date);
      const next = { date, feeling: feeling as ReadinessFeeling };
      if (index >= 0) readiness[index] = next;
      else readiness.push(next);
    }
  }
  const background = inList(raw.background, BACKGROUNDS, "paper");
  const desk = inList(raw.desk, DESKS, "plain");
  const wall = inList(raw.wall, WALLS, "clear");
  const petAccessory = inList(raw.petAccessory, PET_ACCESSORIES, "none");
  const companionAccessory = inList(raw.companionAccessory, COMPANION_ACCESSORIES, "none");
  const favorite = typeof raw.favoriteStickerId === "string" && stickers.has(raw.favoriteStickerId) ? raw.favoriteStickerId : null;
  const title = typeof raw.selectedTitleId === "string" && titles.has(raw.selectedTitleId) ? raw.selectedTitleId : null;
  return {
    version: 1,
    ownerId,
    petName: typeof raw.petName === "string" ? raw.petName.replace(/\s+/g, " ").trim().slice(0, 24) : "",
    petAccessory: petAccessories.has(petAccessory) ? petAccessory : "none",
    companionAccessory: companionAccessories.has(companionAccessory) ? companionAccessory : "none",
    background: backgrounds.has(background) ? background : "paper",
    desk: desks.has(desk) ? desk : "plain",
    wall: walls.has(wall) ? wall : "clear",
    placedStickerIds: keepIds(raw.placedStickerIds, stickers, 12),
    shownBadgeIds: keepIds(raw.shownBadgeIds, badges, 6),
    selectedTitleId: title,
    favoriteStickerId: favorite,
    readiness: readiness.slice(-30),
  };
}

export function readLearningWorld(userId: string | null, evaluation: LearningEvaluation): LearningWorld {
  if (!userId) return defaultLearningWorld(null);
  try {
    const raw = readPrivateString(WORLD_STORAGE_KEY, userId);
    const parsed = raw ? (JSON.parse(raw) as { ownerId?: string }) : null;
    if (parsed && parsed.ownerId && parsed.ownerId !== userId) return defaultLearningWorld(userId);
    return sanitizeLearningWorld(parsed, userId, evaluation);
  } catch {
    return defaultLearningWorld(userId);
  }
}

export function writeLearningWorld(
  world: LearningWorld,
  userId: string | null,
  evaluation: LearningEvaluation
): LearningWorld {
  const next = sanitizeLearningWorld({ ...world, ownerId: userId }, userId, evaluation);
  if (userId) writePrivateString(WORLD_STORAGE_KEY, JSON.stringify(next), userId);
  return next;
}

/**
 * Writes the Study Room record into the open vault and waits until the sealed
 * browser copy finishes. Callers must not report "saved" until this resolves.
 */
export async function commitLearningWorld(
  world: LearningWorld,
  userId: string | null,
  evaluation: LearningEvaluation
): Promise<{ world: LearningWorld; persisted: boolean; error: string | null }> {
  if (!userId) {
    return { world: defaultLearningWorld(null), persisted: false, error: "Sign in before saving the Study Room." };
  }
  if (!isAccountVaultUnlocked() || !privateAccessAllowed(userId)) {
    return {
      world: sanitizeLearningWorld({ ...world, ownerId: userId }, userId, evaluation),
      persisted: false,
      error: "The private study record is still locked on this device.",
    };
  }
  const next = writeLearningWorld(world, userId, evaluation);
  try {
    await flushAccountVault();
    const confirmed = readLearningWorld(userId, evaluation);
    if (
      confirmed.petName !== next.petName ||
      confirmed.petAccessory !== next.petAccessory ||
      confirmed.companionAccessory !== next.companionAccessory ||
      confirmed.background !== next.background ||
      confirmed.desk !== next.desk ||
      confirmed.wall !== next.wall
    ) {
      return {
        world: next,
        persisted: false,
        error: "The Study Room change could not be confirmed on this device.",
      };
    }
    return { world: confirmed, persisted: true, error: null };
  } catch {
    return {
      world: next,
      persisted: false,
      error: "The Study Room change could not be sealed on this device. Try again.",
    };
  }
}
