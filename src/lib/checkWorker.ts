import type { User, WatchedSite } from "@prisma/client";
import {
  analyzeScreenshots,
  AiAnalysisError,
  type AnalysisResult,
} from "@/lib/aiAnalyzer";
import { describeError, errorMessage } from "@/lib/errors";
import { createDiffImage } from "@/lib/imageDiff";
import { planFor, planNameFor } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { getUserDailyChecksCount } from "@/lib/quota";
import { captureScreenshot, ScrapeError } from "@/lib/scraper";
import {
  escapeHtml,
  isTelegramConfigured,
  sendTelegramMessage,
} from "@/lib/telegram";

export { PLAN_LIMITS, planFor, planNameFor, type PlanName } from "@/lib/plans";

export type SkipReason =
  | "plan_site_limit"
  | "daily_check_limit"
  | "interval_not_elapsed"
  | "no_baseline";

/** Этап, на котором проверка упала. */
export type FailedStage = "screenshot" | "analysis" | "persist";

export interface SiteCheckResult {
  siteId: string;
  status: "analyzed" | "skipped" | "failed";
  skipReason?: SkipReason;
  alertSent?: boolean;
  analysis?: AnalysisResult;
  error?: string;
  failedStage?: FailedStage;
}

export interface WorkerRunResult {
  startedAt: Date;
  finishedAt: Date;
  results: SiteCheckResult[];
}

type SiteWithUser = WatchedSite & { user: User };

export function effectiveIntervalHours(site: WatchedSite, user: User): number {
  const { minIntervalHours } = planFor(user);
  return planNameFor(user) === "free"
    ? minIntervalHours
    : Math.max(site.checkIntervalHours, minIntervalHours);
}

/** Подпись со временем до следующей плановой проверки. */
export function nextCheckLabel(
  site: WatchedSite,
  user: User,
  lastCheckedAt: Date | undefined,
  now = new Date(),
): string {
  const intervalHours = effectiveIntervalHours(site, user);
  if (!site.isActive) {
    return "Проверки на паузе";
  }
  if (!lastCheckedAt) {
    return `Ближайшая проверка через ${intervalHours} ч`;
  }

  const dueAt = lastCheckedAt.getTime() + intervalHours * 60 * 60 * 1000;
  const hoursLeft = (dueAt - now.getTime()) / (60 * 60 * 1000);
  if (hoursLeft <= 0) {
    return "Ближайшая проверка в следующем запуске";
  }
  if (hoursLeft < 1) {
    return "Ближайшая проверка менее чем через час";
  }
  return `Ближайшая проверка через ${Math.ceil(hoursLeft)} ч`;
}

function isIntervalElapsed(
  lastCheckedAt: Date | undefined,
  intervalHours: number,
  now: Date,
): boolean {
  if (!lastCheckedAt) {
    return true;
  }
  const elapsedHours =
    (now.getTime() - lastCheckedAt.getTime()) / (60 * 60 * 1000);
  return elapsedHours >= intervalHours;
}

function formatAlert(site: WatchedSite, analysis: AnalysisResult): string {
  const changes = analysis.changes
    .map(
      (change) =>
        `• <b>${escapeHtml(change.type)}</b> (${escapeHtml(change.field)}): ${escapeHtml(change.from)} → ${escapeHtml(change.to)}`,
    )
    .join("\n");

  return [
    `🚨 <b>${escapeHtml(site.name)}</b> — изменения на сайте конкурента`,
    escapeHtml(site.url),
    "",
    escapeHtml(analysis.summary),
    changes,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Снимает страницу, сравнивает с предыдущим снимком и записывает результат
 * в CheckHistory без проверки лимитов и интервала — вызывающая сторона решает,
 * разрешена ли проверка.
 */
export async function performSiteCheck(
  site: SiteWithUser,
): Promise<SiteCheckResult> {
  const lastCheck = await prisma.checkHistory.findFirst({
    where: { siteId: site.id },
    orderBy: { checkedAt: "desc" },
  });

  let screenshotPath: string;
  try {
    ({ screenshotPath } = await captureScreenshot({
      url: site.url,
      cssSelector: site.cssSelector,
    }));
  } catch (error) {
    return {
      siteId: site.id,
      status: "failed",
      failedStage: "screenshot",
      error: describeError(
        error,
        ScrapeError,
        "Ошибка загрузки сайта (Playwright)",
      ),
    };
  }

  try {
    if (!lastCheck) {
      await prisma.$transaction([
        prisma.checkHistory.create({
          data: {
            siteId: site.id,
            screenshotUrl: screenshotPath,
            isBaseline: true,
          },
        }),
        prisma.baselineEvent.create({
          data: {
            userId: site.userId,
            siteId: site.id,
            siteUrl: site.url,
          },
        }),
      ]);
      return { siteId: site.id, status: "skipped", skipReason: "no_baseline" };
    }

    const diff = await createDiffImage(
      lastCheck.screenshotUrl,
      screenshotPath,
    ).catch(() => null);

    let analysis: AnalysisResult;
    try {
      analysis = await analyzeScreenshots(
        lastCheck.screenshotUrl,
        screenshotPath,
      );
    } catch (error) {
      return {
        siteId: site.id,
        status: "failed",
        failedStage: "analysis",
        error: describeError(
          error,
          AiAnalysisError,
          "Ошибка анализа ИИ (Vision API)",
        ),
      };
    }

    await prisma.checkHistory.create({
      data: {
        siteId: site.id,
        screenshotUrl: screenshotPath,
        diffImageUrl: diff?.diffPath ?? null,
        diffRatio: diff?.diffRatio ?? null,
        aiSummary: analysis.summary,
        isAlertTriggered: analysis.hasChanges,
      },
    });

    let alertSent = false;
    const chatId = site.user.telegramChatId ?? process.env.TELEGRAM_CHAT_ID;
    if (
      analysis.hasChanges &&
      analysis.urgency === "high" &&
      planNameFor(site.user) !== "free" &&
      chatId &&
      isTelegramConfigured()
    ) {
      await sendTelegramMessage({
        chatId,
        text: formatAlert(site, analysis),
      });
      alertSent = true;
    }

    return { siteId: site.id, status: "analyzed", analysis, alertSent };
  } catch (error) {
    console.error("Check Persist Error Details:", error);
    return {
      siteId: site.id,
      status: "failed",
      failedStage: "persist",
      error: errorMessage(error),
    };
  }
}

async function checkSite(
  site: SiteWithUser,
  allowedSiteIds: Set<string>,
  dailyChecksLeft: Map<string, number>,
  now: Date,
): Promise<SiteCheckResult> {
  if (!allowedSiteIds.has(site.id)) {
    return {
      siteId: site.id,
      status: "skipped",
      skipReason: "plan_site_limit",
    };
  }

  const lastCheck = await prisma.checkHistory.findFirst({
    where: { siteId: site.id },
    orderBy: { checkedAt: "desc" },
    select: { checkedAt: true },
  });

  const intervalHours = effectiveIntervalHours(site, site.user);
  if (!isIntervalElapsed(lastCheck?.checkedAt, intervalHours, now)) {
    return {
      siteId: site.id,
      status: "skipped",
      skipReason: "interval_not_elapsed",
    };
  }

  const checksLeft = dailyChecksLeft.get(site.userId) ?? 0;
  if (checksLeft <= 0) {
    return {
      siteId: site.id,
      status: "skipped",
      skipReason: "daily_check_limit",
    };
  }
  dailyChecksLeft.set(site.userId, checksLeft - 1);

  return performSiteCheck(site);
}

export async function runCheckWorker(
  now = new Date(),
): Promise<WorkerRunResult> {
  const startedAt = now;

  const sites = await prisma.watchedSite.findMany({
    where: { isActive: true },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  const allowedSiteIds = new Set<string>();
  const perUserCount = new Map<string, number>();
  for (const site of sites) {
    const used = perUserCount.get(site.userId) ?? 0;
    if (used < planFor(site.user).maxSites) {
      allowedSiteIds.add(site.id);
      perUserCount.set(site.userId, used + 1);
    }
  }

  const dailyChecksLeft = new Map<string, number>();
  for (const site of sites) {
    if (dailyChecksLeft.has(site.userId)) {
      continue;
    }
    const maxDailyChecks = planFor(site.user).maxDailyChecks;
    if (maxDailyChecks === null) {
      dailyChecksLeft.set(site.userId, Number.POSITIVE_INFINITY);
      continue;
    }
    const used = await getUserDailyChecksCount(site.userId, now);
    dailyChecksLeft.set(site.userId, maxDailyChecks - used);
  }

  const results: SiteCheckResult[] = [];
  for (const site of sites) {
    results.push(await checkSite(site, allowedSiteIds, dailyChecksLeft, now));
  }

  return { startedAt, finishedAt: new Date(), results };
}
