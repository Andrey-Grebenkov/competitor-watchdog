import type { User, WatchedSite } from "@prisma/client";
import { analyzeScreenshots, type AnalysisResult } from "@/lib/aiAnalyzer";
import { prisma } from "@/lib/prisma";
import { captureScreenshot } from "@/lib/scraper";
import { escapeHtml, isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";

export const PLAN_LIMITS = {
  free: { maxSites: 2, minIntervalHours: 24 },
  premium: { maxSites: 25, minIntervalHours: 1 },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;

export type SkipReason =
  | "plan_site_limit"
  | "interval_not_elapsed"
  | "no_baseline";

export interface SiteCheckResult {
  siteId: string;
  status: "analyzed" | "skipped" | "failed";
  skipReason?: SkipReason;
  alertSent?: boolean;
  analysis?: AnalysisResult;
  error?: string;
}

export interface WorkerRunResult {
  startedAt: Date;
  finishedAt: Date;
  results: SiteCheckResult[];
}

type SiteWithUser = WatchedSite & { user: User };

export function planFor(user: User): (typeof PLAN_LIMITS)[PlanName] {
  return user.subscriptionStatus === "premium"
    ? PLAN_LIMITS.premium
    : PLAN_LIMITS.free;
}

export function effectiveIntervalHours(
  site: WatchedSite,
  user: User,
): number {
  const { minIntervalHours } = planFor(user);
  return user.subscriptionStatus === "premium"
    ? Math.max(site.checkIntervalHours, minIntervalHours)
    : minIntervalHours;
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

async function checkSite(
  site: SiteWithUser,
  allowedSiteIds: Set<string>,
  now: Date,
): Promise<SiteCheckResult> {
  if (!allowedSiteIds.has(site.id)) {
    return { siteId: site.id, status: "skipped", skipReason: "plan_site_limit" };
  }

  const lastCheck = await prisma.checkHistory.findFirst({
    where: { siteId: site.id },
    orderBy: { checkedAt: "desc" },
  });

  const intervalHours = effectiveIntervalHours(site, site.user);
  if (!isIntervalElapsed(lastCheck?.checkedAt, intervalHours, now)) {
    return {
      siteId: site.id,
      status: "skipped",
      skipReason: "interval_not_elapsed",
    };
  }

  try {
    const { screenshotPath } = await captureScreenshot({
      url: site.url,
      cssSelector: site.cssSelector,
    });

    if (!lastCheck) {
      await prisma.checkHistory.create({
        data: { siteId: site.id, screenshotUrl: screenshotPath },
      });
      return { siteId: site.id, status: "skipped", skipReason: "no_baseline" };
    }

    const analysis = await analyzeScreenshots(
      lastCheck.screenshotUrl,
      screenshotPath,
    );

    await prisma.checkHistory.create({
      data: {
        siteId: site.id,
        screenshotUrl: screenshotPath,
        aiSummary: analysis.summary,
        isAlertTriggered: analysis.hasChanges,
      },
    });

    let alertSent = false;
    const chatId = site.user.telegramChatId ?? process.env.TELEGRAM_CHAT_ID;
    if (
      analysis.hasChanges &&
      analysis.urgency === "high" &&
      site.user.subscriptionStatus === "premium" &&
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
    return {
      siteId: site.id,
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function runCheckWorker(now = new Date()): Promise<WorkerRunResult> {
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

  const results: SiteCheckResult[] = [];
  for (const site of sites) {
    results.push(await checkSite(site, allowedSiteIds, now));
  }

  return { startedAt, finishedAt: new Date(), results };
}
