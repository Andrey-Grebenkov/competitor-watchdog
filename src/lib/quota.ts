import type { User } from "@prisma/client";
import { PLAN_LIMITS, planFor, planNameFor, type PlanName } from "@/lib/plans";
import { prisma } from "@/lib/prisma";

export const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Количество сравнительных проверок пользователя за последние 24 часа.
 * Эталонные снимки считаются отдельной квотой (`getUserDailyBaselinesCount`).
 */
export async function getUserDailyChecksCount(
  userId: string,
  now = new Date(),
): Promise<number> {
  return prisma.checkHistory.count({
    where: {
      site: { userId },
      isBaseline: false,
      checkedAt: { gte: new Date(now.getTime() - DAILY_WINDOW_MS) },
    },
  });
}

/** Количество эталонных снимков пользователя за последние 24 часа. */
export async function getUserDailyBaselinesCount(
  userId: string,
  now = new Date(),
): Promise<number> {
  return prisma.baselineEvent.count({
    where: {
      userId,
      createdAt: { gte: new Date(now.getTime() - DAILY_WINDOW_MS) },
    },
  });
}

export interface UserQuota {
  planName: PlanName;
  limits: (typeof PLAN_LIMITS)[PlanName];
  sitesUsed: number;
  checksUsed: number;
  baselinesUsed: number;
  sitesExhausted: boolean;
  dailyChecksExhausted: boolean;
  dailyBaselinesExhausted: boolean;
}

export async function getUserQuota(
  user: User,
  now = new Date(),
): Promise<UserQuota> {
  const limits = planFor(user);
  const [sitesUsed, checksUsed, baselinesUsed] = await Promise.all([
    prisma.watchedSite.count({ where: { userId: user.id } }),
    getUserDailyChecksCount(user.id, now),
    getUserDailyBaselinesCount(user.id, now),
  ]);

  return {
    planName: planNameFor(user),
    limits,
    sitesUsed,
    checksUsed,
    baselinesUsed,
    sitesExhausted: sitesUsed >= limits.maxSites,
    dailyChecksExhausted: checksUsed >= limits.maxDailyChecks,
    dailyBaselinesExhausted:
      limits.maxDailyBaselines !== null &&
      baselinesUsed >= limits.maxDailyBaselines,
  };
}

export function dailyLimitMessage(quota: UserQuota): string {
  return `Вы исчерпали суточный лимит проверок (${quota.checksUsed}/${quota.limits.maxDailyChecks})`;
}

export function baselineLimitMessage(quota: UserQuota): string {
  return `Вы исчерпали лимит создания эталонов на сегодня (${quota.baselinesUsed}/${quota.limits.maxDailyBaselines}). Перейдите на тариф Pro или попробуйте завтра`;
}

/** Надпись со счётчиком эталонов для шапки дашборда. */
export function baselineQuotaLabel(quota: UserQuota): string {
  return quota.limits.maxDailyBaselines === null
    ? `${quota.baselinesUsed}/∞`
    : `${quota.baselinesUsed}/${quota.limits.maxDailyBaselines}`;
}
