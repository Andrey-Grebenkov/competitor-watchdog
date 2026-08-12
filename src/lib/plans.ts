import type { User } from "@prisma/client";

export interface PlanLimits {
  maxSites: number;
  minIntervalHours: number;
  /** `null` — без ограничений. */
  maxDailyChecks: number | null;
  /** `null` — без ограничений. */
  maxDailyBaselines: number | null;
}

export const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  free: {
    maxSites: 2,
    minIntervalHours: 24,
    maxDailyChecks: 2,
    maxDailyBaselines: 5,
  },
  premium: {
    maxSites: 25,
    minIntervalHours: 1,
    maxDailyChecks: 600,
    maxDailyBaselines: null,
  },
  unlimited: {
    maxSites: Number.MAX_SAFE_INTEGER,
    minIntervalHours: 1,
    maxDailyChecks: null,
    maxDailyBaselines: null,
  },
};

export type PlanName = "free" | "premium" | "unlimited";

/** ADMIN и пользователи с `isUnlimited` работают без лимитов тарифа. */
export function hasUnlimitedAccess(user: User): boolean {
  return user.role === "ADMIN" || user.isUnlimited;
}

export function planNameFor(user: User): PlanName {
  if (hasUnlimitedAccess(user)) {
    return "unlimited";
  }
  return user.subscriptionStatus === "premium" ? "premium" : "free";
}

export function planFor(user: User): PlanLimits {
  return PLAN_LIMITS[planNameFor(user)];
}

export function planLabel(planName: PlanName): string {
  return { free: "Free", premium: "Premium", unlimited: "Unlimited" }[planName];
}
