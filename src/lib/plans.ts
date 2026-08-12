import type { User } from "@prisma/client";

/** `maxDailyBaselines: null` — без ограничений. */
export const PLAN_LIMITS = {
  free: {
    maxSites: 2,
    minIntervalHours: 24,
    maxDailyChecks: 2,
    maxDailyBaselines: 5 as number | null,
  },
  premium: {
    maxSites: 25,
    minIntervalHours: 1,
    maxDailyChecks: 600,
    maxDailyBaselines: null as number | null,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export function planNameFor(user: User): PlanName {
  return user.subscriptionStatus === "premium" ? "premium" : "free";
}

export function planFor(user: User): (typeof PLAN_LIMITS)[PlanName] {
  return PLAN_LIMITS[planNameFor(user)];
}
