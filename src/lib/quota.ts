import type { User } from "@prisma/client";
import { PLAN_LIMITS, planFor, planNameFor, type PlanName } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Количество проверок пользователя за последние 24 часа. */
export async function getUserDailyChecksCount(
  userId: string,
  now = new Date(),
): Promise<number> {
  return prisma.checkHistory.count({
    where: {
      site: { userId },
      checkedAt: { gte: new Date(now.getTime() - DAILY_WINDOW_MS) },
    },
  });
}

export interface UserQuota {
  planName: PlanName;
  limits: (typeof PLAN_LIMITS)[PlanName];
  sitesUsed: number;
  checksUsed: number;
  sitesExhausted: boolean;
  dailyChecksExhausted: boolean;
}

export async function getUserQuota(
  user: User,
  now = new Date(),
): Promise<UserQuota> {
  const limits = planFor(user);
  const [sitesUsed, checksUsed] = await Promise.all([
    prisma.watchedSite.count({ where: { userId: user.id } }),
    getUserDailyChecksCount(user.id, now),
  ]);

  return {
    planName: planNameFor(user),
    limits,
    sitesUsed,
    checksUsed,
    sitesExhausted: sitesUsed >= limits.maxSites,
    dailyChecksExhausted: checksUsed >= limits.maxDailyChecks,
  };
}

export function dailyLimitMessage(quota: UserQuota): string {
  return `Вы исчерпали суточный лимит проверок (${quota.checksUsed}/${quota.limits.maxDailyChecks})`;
}
