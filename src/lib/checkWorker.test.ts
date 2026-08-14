import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User, WatchedSite } from "@prisma/client";
import {
  AiAnalysisError,
  analyzeScreenshots,
  type AnalysisResult,
} from "@/lib/aiAnalyzer";
import {
  effectiveIntervalHours,
  nextCheckLabel,
  performSiteCheck,
  runCheckWorker,
} from "@/lib/checkWorker";
import { createDiffImage } from "@/lib/imageDiff";
import { prisma } from "@/lib/prisma";
import { getUserDailyChecksCount } from "@/lib/quota";
import { ScrapeError, captureScreenshot } from "@/lib/scraper";
import { isTelegramConfigured, sendTelegramMessage } from "@/lib/telegram";
import { makeSite, makeUser } from "@/test/factories";

vi.mock("@/lib/aiAnalyzer", async () => {
  const actual = await import("@/lib/aiAnalyzer");
  return { ...actual, analyzeScreenshots: vi.fn() };
});
vi.mock("@/lib/imageDiff", () => ({ createDiffImage: vi.fn() }));
vi.mock("@/lib/scraper", async () => {
  const actual = await import("@/lib/scraper");
  return { ...actual, captureScreenshot: vi.fn() };
});
vi.mock("@/lib/quota", () => ({ getUserDailyChecksCount: vi.fn() }));
vi.mock("@/lib/telegram", async () => {
  const actual = await import("@/lib/telegram");
  return {
    ...actual,
    isTelegramConfigured: vi.fn(),
    sendTelegramMessage: vi.fn(),
  };
});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    checkHistory: { findFirst: vi.fn(), create: vi.fn() },
    baselineEvent: { create: vi.fn() },
    watchedSite: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const analyzeMock = vi.mocked(analyzeScreenshots);
const diffMock = vi.mocked(createDiffImage);
const captureMock = vi.mocked(captureScreenshot);
const dailyChecksMock = vi.mocked(getUserDailyChecksCount);
const telegramConfiguredMock = vi.mocked(isTelegramConfigured);
const sendTelegramMock = vi.mocked(sendTelegramMessage);
const findFirstMock = vi.mocked(prisma.checkHistory.findFirst);
const createCheckMock = vi.mocked(prisma.checkHistory.create);
const transactionMock = vi.mocked(prisma.$transaction);
const findManyMock = vi.mocked(prisma.watchedSite.findMany);

const NOW = new Date("2026-08-13T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

const HIGH_URGENCY: AnalysisResult = {
  hasChanges: true,
  summary: "Цена упала",
  urgency: "high",
  changes: [{ type: "price", field: "Pro", from: "100", to: "90" }],
};
const NO_CHANGES: AnalysisResult = {
  hasChanges: false,
  summary: "Без изменений",
  urgency: "low",
  changes: [],
};

function siteWithUser(
  site: Partial<WatchedSite> = {},
  user: Partial<User> = {},
): WatchedSite & { user: User } {
  const owner = makeUser(user);
  return { ...makeSite({ userId: owner.id, ...site }), user: owner };
}

beforeEach(() => {
  captureMock.mockReset().mockResolvedValue({
    screenshotPath: "/tmp/screenshots/new.png",
    capturedAt: NOW,
    usedSelector: false,
  });
  analyzeMock.mockReset().mockResolvedValue(NO_CHANGES);
  diffMock
    .mockReset()
    .mockResolvedValue({ diffPath: "/tmp/screenshots/d-diff.png", diffRatio: 0.2 });
  dailyChecksMock.mockReset().mockResolvedValue(0);
  telegramConfiguredMock.mockReset().mockReturnValue(true);
  sendTelegramMock.mockReset().mockResolvedValue(undefined);
  findFirstMock.mockReset().mockResolvedValue(null);
  createCheckMock.mockReset().mockResolvedValue({} as never);
  transactionMock.mockReset().mockResolvedValue([] as never);
  findManyMock.mockReset().mockResolvedValue([] as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("TELEGRAM_CHAT_ID", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("effectiveIntervalHours", () => {
  it("forces the plan minimum for free users", () => {
    expect(
      effectiveIntervalHours(makeSite({ checkIntervalHours: 1 }), makeUser()),
    ).toBe(24);
    expect(
      effectiveIntervalHours(makeSite({ checkIntervalHours: 72 }), makeUser()),
    ).toBe(24);
  });

  it("respects the site interval above the minimum for paid users", () => {
    const premium = makeUser({ subscriptionStatus: "premium" });
    expect(
      effectiveIntervalHours(makeSite({ checkIntervalHours: 6 }), premium),
    ).toBe(6);
    expect(
      effectiveIntervalHours(makeSite({ checkIntervalHours: 0 }), premium),
    ).toBe(1);
  });
});

describe("nextCheckLabel", () => {
  const user = makeUser({ subscriptionStatus: "premium" });
  const site = makeSite({ checkIntervalHours: 6 });

  it("reports paused checks regardless of the schedule", () => {
    expect(
      nextCheckLabel(makeSite({ isActive: false }), user, undefined, NOW),
    ).toBe("Проверки на паузе");
  });

  it("reports the full interval when there is no previous check", () => {
    expect(nextCheckLabel(site, user, undefined, NOW)).toBe(
      "Ближайшая проверка через 6 ч",
    );
  });

  it("rounds the remaining time up", () => {
    const lastCheckedAt = new Date(NOW.getTime() - 2.5 * HOUR_MS);
    expect(nextCheckLabel(site, user, lastCheckedAt, NOW)).toBe(
      "Ближайшая проверка через 4 ч",
    );
  });

  it("reports sub-hour and overdue schedules", () => {
    expect(
      nextCheckLabel(site, user, new Date(NOW.getTime() - 5.5 * HOUR_MS), NOW),
    ).toBe("Ближайшая проверка менее чем через час");
    expect(
      nextCheckLabel(site, user, new Date(NOW.getTime() - 7 * HOUR_MS), NOW),
    ).toBe("Ближайшая проверка в следующем запуске");
  });
});

describe("performSiteCheck", () => {
  it("stores a baseline snapshot and a baseline event on the first check", async () => {
    const site = siteWithUser();

    const result = await performSiteCheck(site);

    expect(result).toEqual({
      siteId: site.id,
      status: "skipped",
      skipReason: "no_baseline",
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(analyzeMock).not.toHaveBeenCalled();
    expect(createCheckMock).toHaveBeenCalledWith({
      data: {
        siteId: site.id,
        screenshotUrl: "/tmp/screenshots/new.png",
        isBaseline: true,
      },
    });
    expect(vi.mocked(prisma.baselineEvent.create)).toHaveBeenCalledWith({
      data: { userId: site.userId, siteId: site.id, siteUrl: site.url },
    });
  });

  it("persists the analysis with the pixel diff on a repeat check", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockResolvedValue(NO_CHANGES);
    const site = siteWithUser();

    const result = await performSiteCheck(site);

    expect(result).toEqual({
      siteId: site.id,
      status: "analyzed",
      analysis: NO_CHANGES,
      alertSent: false,
    });
    expect(analyzeMock).toHaveBeenCalledWith(
      "/tmp/screenshots/old.png",
      "/tmp/screenshots/new.png",
    );
    expect(createCheckMock).toHaveBeenCalledWith({
      data: {
        siteId: site.id,
        screenshotUrl: "/tmp/screenshots/new.png",
        diffImageUrl: "/tmp/screenshots/d-diff.png",
        diffRatio: 0.2,
        aiSummary: NO_CHANGES.summary,
        isAlertTriggered: false,
      },
    });
  });

  it("keeps analyzing when the pixel diff fails", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    diffMock.mockRejectedValue(new Error("bad png"));
    const site = siteWithUser();

    const result = await performSiteCheck(site);

    expect(result.status).toBe("analyzed");
    expect(createCheckMock.mock.calls[0][0].data).toMatchObject({
      diffImageUrl: null,
      diffRatio: null,
    });
  });

  it("sends a Telegram alert for a high-urgency change of a paid user", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockResolvedValue(HIGH_URGENCY);
    const site = siteWithUser(
      { name: "A & B" },
      { subscriptionStatus: "premium", telegramChatId: "chat-9" },
    );

    const result = await performSiteCheck(site);

    expect(result.alertSent).toBe(true);
    expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    const { chatId, text } = sendTelegramMock.mock.calls[0][0];
    expect(chatId).toBe("chat-9");
    expect(text).toContain("A &amp; B");
    expect(text).toContain("<b>price</b> (Pro): 100 → 90");
  });

  it("falls back to TELEGRAM_CHAT_ID when the user has no chat", async () => {
    vi.stubEnv("TELEGRAM_CHAT_ID", "fallback-chat");
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockResolvedValue(HIGH_URGENCY);

    const result = await performSiteCheck(
      siteWithUser({}, { subscriptionStatus: "premium" }),
    );

    expect(result.alertSent).toBe(true);
    expect(sendTelegramMock.mock.calls[0][0].chatId).toBe("fallback-chat");
  });

  it.each([
    [
      "the user is on the free plan",
      HIGH_URGENCY,
      { telegramChatId: "chat-9" },
      true,
    ],
    [
      "the urgency is not high",
      { ...HIGH_URGENCY, urgency: "medium" as const },
      { subscriptionStatus: "premium", telegramChatId: "chat-9" },
      true,
    ],
    [
      "nothing changed",
      { ...NO_CHANGES, urgency: "high" as const },
      { subscriptionStatus: "premium", telegramChatId: "chat-9" },
      true,
    ],
    [
      "no chat id is known",
      HIGH_URGENCY,
      { subscriptionStatus: "premium" },
      true,
    ],
    [
      "the bot is not configured",
      HIGH_URGENCY,
      { subscriptionStatus: "premium", telegramChatId: "chat-9" },
      false,
    ],
  ])(
    "skips the alert when %s",
    async (
      _case: string,
      analysis: AnalysisResult,
      user: Partial<User>,
      telegramConfigured: boolean,
    ) => {
      findFirstMock.mockResolvedValue({
        screenshotUrl: "/tmp/screenshots/old.png",
      } as never);
      analyzeMock.mockResolvedValue(analysis);
      telegramConfiguredMock.mockReturnValue(telegramConfigured);

      const result = await performSiteCheck(siteWithUser({}, user));

      expect(result.status).toBe("analyzed");
      expect(result.alertSent).toBe(false);
      expect(sendTelegramMock).not.toHaveBeenCalled();
    },
  );

  it("reports a screenshot failure without touching the analyzer", async () => {
    captureMock.mockRejectedValue(new ScrapeError("Ошибка загрузки сайта (Playwright): timeout"));
    const site = siteWithUser();

    const result = await performSiteCheck(site);

    expect(result).toEqual({
      siteId: site.id,
      status: "failed",
      failedStage: "screenshot",
      error: "Ошибка загрузки сайта (Playwright): timeout",
    });
    expect(analyzeMock).not.toHaveBeenCalled();
  });

  it("labels an unexpected screenshot error as a Playwright failure", async () => {
    captureMock.mockRejectedValue("boom");

    const result = await performSiteCheck(siteWithUser());

    expect(result.failedStage).toBe("screenshot");
    expect(result.error).toBe("Ошибка загрузки сайта (Playwright): boom");
  });

  it("reports an analysis failure without persisting a check", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockRejectedValue(new AiAnalysisError("Vision API вернул ошибку 404"));

    const result = await performSiteCheck(siteWithUser());

    expect(result).toMatchObject({
      status: "failed",
      failedStage: "analysis",
      error: "Vision API вернул ошибку 404",
    });
    expect(createCheckMock).not.toHaveBeenCalled();
  });

  it("labels an unexpected analysis error as a Vision API failure", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockRejectedValue(new Error("socket hang up"));

    const result = await performSiteCheck(siteWithUser());

    expect(result.failedStage).toBe("analysis");
    expect(result.error).toBe(
      "Ошибка анализа ИИ (Vision API): socket hang up",
    );
  });

  it("reports a persist failure when the alert cannot be delivered", async () => {
    findFirstMock.mockResolvedValue({
      screenshotUrl: "/tmp/screenshots/old.png",
    } as never);
    analyzeMock.mockResolvedValue(HIGH_URGENCY);
    sendTelegramMock.mockRejectedValue(new Error("Telegram API returned 400"));

    const result = await performSiteCheck(
      siteWithUser(
        {},
        { subscriptionStatus: "premium", telegramChatId: "chat-9" },
      ),
    );

    expect(result).toMatchObject({
      status: "failed",
      failedStage: "persist",
      error: "Telegram API returned 400",
    });
  });

  it("reports a persist failure when the baseline transaction fails", async () => {
    transactionMock.mockRejectedValue("db down");

    const result = await performSiteCheck(siteWithUser());

    expect(result).toMatchObject({ failedStage: "persist", error: "db down" });
  });
});

describe("runCheckWorker", () => {
  it("returns an empty run when there are no active sites", async () => {
    const result = await runCheckWorker(NOW);

    expect(result.results).toEqual([]);
    expect(result.startedAt).toBe(NOW);
    expect(result.finishedAt).toBeInstanceOf(Date);
    expect(findManyMock).toHaveBeenCalledWith({
      where: { isActive: true },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });
  });

  it("skips sites beyond the plan site limit, keeping the oldest ones", async () => {
    const sites = [1, 2, 3].map((index) =>
      siteWithUser({ id: `site-${index}` }),
    );
    findManyMock.mockResolvedValue(sites as never);

    const { results } = await runCheckWorker(NOW);

    expect(results.map((item) => item.skipReason)).toEqual([
      "no_baseline",
      "no_baseline",
      "plan_site_limit",
    ]);
  });

  it("skips a site whose interval has not elapsed yet", async () => {
    findManyMock.mockResolvedValue([siteWithUser()] as never);
    findFirstMock.mockResolvedValue({
      checkedAt: new Date(NOW.getTime() - 2 * HOUR_MS),
    } as never);

    const { results } = await runCheckWorker(NOW);

    expect(results[0]).toMatchObject({ skipReason: "interval_not_elapsed" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("skips a site once the daily check limit is used up", async () => {
    findManyMock.mockResolvedValue([siteWithUser()] as never);
    dailyChecksMock.mockResolvedValue(2);

    const { results } = await runCheckWorker(NOW);

    expect(results[0]).toMatchObject({ skipReason: "daily_check_limit" });
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("spends the remaining daily budget across the sites of one user", async () => {
    const owner = makeUser({ subscriptionStatus: "premium" });
    const sites = [1, 2, 3].map((index) => ({
      ...makeSite({ id: `site-${index}`, userId: owner.id }),
      user: owner,
    }));
    findManyMock.mockResolvedValue(sites as never);
    dailyChecksMock.mockResolvedValue(598);

    const { results } = await runCheckWorker(NOW);

    expect(results.map((item) => item.skipReason)).toEqual([
      "no_baseline",
      "no_baseline",
      "daily_check_limit",
    ]);
    expect(dailyChecksMock).toHaveBeenCalledTimes(1);
  });

  it("never queries the daily counter for unlimited users", async () => {
    findManyMock.mockResolvedValue([
      siteWithUser({}, { role: "ADMIN" }),
    ] as never);

    const { results } = await runCheckWorker(NOW);

    expect(dailyChecksMock).not.toHaveBeenCalled();
    expect(results[0]).toMatchObject({ skipReason: "no_baseline" });
  });

  it("checks a due site and reports the analysis", async () => {
    findManyMock.mockResolvedValue([siteWithUser()] as never);
    findFirstMock
      .mockResolvedValueOnce({
        checkedAt: new Date(NOW.getTime() - 48 * HOUR_MS),
      } as never)
      .mockResolvedValueOnce({
        screenshotUrl: "/tmp/screenshots/old.png",
      } as never);

    const { results } = await runCheckWorker(NOW);

    expect(results[0]).toMatchObject({ status: "analyzed" });
    expect(captureMock).toHaveBeenCalledTimes(1);
  });
});
