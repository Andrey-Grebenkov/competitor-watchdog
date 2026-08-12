import type { User } from "@prisma/client";
import {
  hasUnlimitedAccess,
  planFor,
  planNameFor,
  type PlanLimits,
  type PlanName,
} from "@/lib/plans";
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
  limits: PlanLimits;
  unlimited: boolean;
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
  const unlimited = hasUnlimitedAccess(user);
  const [sitesUsed, checksUsed, baselinesUsed] = await Promise.all([
    prisma.watchedSite.count({ where: { userId: user.id } }),
    getUserDailyChecksCount(user.id, now),
    getUserDailyBaselinesCount(user.id, now),
  ]);

  return {
    planName: planNameFor(user),
    limits,
    unlimited,
    sitesUsed,
    checksUsed,
    baselinesUsed,
    sitesExhausted: !unlimited && sitesUsed >= limits.maxSites,
    dailyChecksExhausted:
      !unlimited &&
      limits.maxDailyChecks !== null &&
      checksUsed >= limits.maxDailyChecks,
    dailyBaselinesExhausted:
      !unlimited &&
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

function quotaLabel(used: number, limit: number | null): string {
  return limit === null ? `${used}/∞` : `${used}/${limit}`;
}

/** Надпись со счётчиком сайтов для шапки дашборда. */
export function sitesQuotaLabel(quota: UserQuota): string {
  return quotaLabel(
    quota.sitesUsed,
    quota.unlimited ? null : quota.limits.maxSites,
  );
}

/** Надпись со счётчиком проверок для шапки дашборда. */
export function checksQuotaLabel(quota: UserQuota): string {
  return quotaLabel(quota.checksUsed, quota.limits.maxDailyChecks);
}

/** Надпись со счётчиком эталонов для шапки дашборда. */
export function baselineQuotaLabel(quota: UserQuota): string {
  return quotaLabel(quota.baselinesUsed, quota.limits.maxDailyBaselines);
}
