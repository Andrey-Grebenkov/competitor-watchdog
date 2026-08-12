import type { User } from "@prisma/client";

export const PLAN_LIMITS = {
  free: { maxSites: 2, minIntervalHours: 24, maxDailyChecks: 2 },
  premium: { maxSites: 25, minIntervalHours: 1, maxDailyChecks: 600 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export function planNameFor(user: User): PlanName {
  return user.subscriptionStatus === "premium" ? "premium" : "free";
}

export function planFor(user: User): (typeof PLAN_LIMITS)[PlanName] {
  return PLAN_LIMITS[planNameFor(user)];
}
