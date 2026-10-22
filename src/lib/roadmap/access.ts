import { isEntitled } from "@/lib/access/gate";

/**
 * Planner access is entitlement-based, not a hard-coded price lock.
 * Already-entitled students (free, paid, sponsored, trial) can use it.
 */
export const ROADMAP_ACCESS = {
  featureKey: "my_study_roadmap",
  enabled: true,
  requireEntitledAccess: true,
} as const;

export function canUseRoadmap(accessStatus: string | null | undefined): boolean {
  if (!ROADMAP_ACCESS.enabled) return false;
  if (!ROADMAP_ACCESS.requireEntitledAccess) return true;
  return isEntitled(accessStatus);
}
