import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DAILY_WINDOW_MS,
  baselineLimitMessage,
  baselineQuotaLabel,
  checksQuotaLabel,
  dailyLimitMessage,
  getUserDailyBaselinesCount,
  getUserDailyChecksCount,
  getUserQuota,
  sitesQuotaLabel,
  type UserQuota,
} from "@/lib/quota";
import { prisma } from "@/lib/prisma";
import { makeUser } from "@/test/factories";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    checkHistory: { count: vi.fn() },
    baselineEvent: { count: vi.fn() },
    watchedSite: { count: vi.fn() },
  },
}));

const checkHistoryCount = vi.mocked(prisma.checkHistory.count);
const baselineEventCount = vi.mocked(prisma.baselineEvent.count);
const watchedSiteCount = vi.mocked(prisma.watchedSite.count);

const NOW = new Date("2026-08-13T12:00:00.000Z");
const WINDOW_START = new Date(NOW.getTime() - DAILY_WINDOW_MS);

beforeEach(() => {
  checkHistoryCount.mockReset().mockResolvedValue(0);
  baselineEventCount.mockReset().mockResolvedValue(0);
  watchedSiteCount.mockReset().mockResolvedValue(0);
});

describe("getUserDailyChecksCount", () => {
  it("counts only comparison checks inside the 24h window", async () => {
    checkHistoryCount.mockResolvedValue(3);

    await expect(getUserDailyChecksCount("user-1", NOW)).resolves.toBe(3);
    expect(checkHistoryCount).toHaveBeenCalledWith({
      where: {
        site: { userId: "user-1" },
        isBaseline: false,
        checkedAt: { gte: WINDOW_START },
      },
    });
  });
});

describe("getUserDailyBaselinesCount", () => {
  it("counts baseline events from the standalone journal", async () => {
    baselineEventCount.mockResolvedValue(4);

    await expect(getUserDailyBaselinesCount("user-1", NOW)).resolves.toBe(4);
    expect(baselineEventCount).toHaveBeenCalledWith({
      where: { userId: "user-1", createdAt: { gte: WINDOW_START } },
    });
  });
});

describe("getUserQuota", () => {
  it("marks free-plan quotas as exhausted once the limits are reached", async () => {
    watchedSiteCount.mockResolvedValue(2);
    checkHistoryCount.mockResolvedValue(2);
    baselineEventCount.mockResolvedValue(5);

    const quota = await getUserQuota(makeUser(), NOW);

    expect(quota).toMatchObject({
      planName: "free",
      unlimited: false,
      sitesUsed: 2,
      checksUsed: 2,
      baselinesUsed: 5,
      sitesExhausted: true,
      dailyChecksExhausted: true,
      dailyBaselinesExhausted: true,
    });
  });

  it("keeps quotas available below the limits", async () => {
    watchedSiteCount.mockResolvedValue(1);
    checkHistoryCount.mockResolvedValue(1);
    baselineEventCount.mockResolvedValue(4);

    const quota = await getUserQuota(makeUser(), NOW);

    expect(quota.sitesExhausted).toBe(false);
    expect(quota.dailyChecksExhausted).toBe(false);
    expect(quota.dailyBaselinesExhausted).toBe(false);
  });

  it("never exhausts anything for unlimited users", async () => {
    watchedSiteCount.mockResolvedValue(1_000);
    checkHistoryCount.mockResolvedValue(1_000);
    baselineEventCount.mockResolvedValue(1_000);

    const quota = await getUserQuota(makeUser({ role: "ADMIN" }), NOW);

    expect(quota).toMatchObject({
      planName: "unlimited",
      unlimited: true,
      sitesExhausted: false,
      dailyChecksExhausted: false,
      dailyBaselinesExhausted: false,
    });
  });

  it("ignores the baseline quota for premium (null limit) but keeps checks", async () => {
    watchedSiteCount.mockResolvedValue(3);
    checkHistoryCount.mockResolvedValue(600);
    baselineEventCount.mockResolvedValue(9_999);

    const quota = await getUserQuota(
      makeUser({ subscriptionStatus: "premium" }),
      NOW,
    );

    expect(quota.planName).toBe("premium");
    expect(quota.dailyChecksExhausted).toBe(true);
    expect(quota.dailyBaselinesExhausted).toBe(false);
    expect(quota.sitesExhausted).toBe(false);
  });
});

function quotaFixture(overrides: Partial<UserQuota> = {}): UserQuota {
  return {
    planName: "free",
    limits: {
      maxSites: 2,
      minIntervalHours: 24,
      maxDailyChecks: 2,
      maxDailyBaselines: 5,
    },
    unlimited: false,
    sitesUsed: 2,
    checksUsed: 2,
    baselinesUsed: 5,
    sitesExhausted: true,
    dailyChecksExhausted: true,
    dailyBaselinesExhausted: true,
    ...overrides,
  };
}

describe("limit messages", () => {
  it("includes the used/limit counters", () => {
    expect(dailyLimitMessage(quotaFixture())).toContain("(2/2)");
    expect(baselineLimitMessage(quotaFixture())).toContain("(5/5)");
  });
});

describe("quota labels", () => {
  it("renders used/limit pairs", () => {
    const quota = quotaFixture({ sitesUsed: 1, checksUsed: 0, baselinesUsed: 3 });

    expect(sitesQuotaLabel(quota)).toBe("1/2");
    expect(checksQuotaLabel(quota)).toBe("0/2");
    expect(baselineQuotaLabel(quota)).toBe("3/5");
  });

  it("renders infinity for unlimited plans and null limits", () => {
    const quota = quotaFixture({
      planName: "unlimited",
      unlimited: true,
      limits: {
        maxSites: Number.MAX_SAFE_INTEGER,
        minIntervalHours: 1,
        maxDailyChecks: null,
        maxDailyBaselines: null,
      },
      sitesUsed: 7,
      checksUsed: 8,
      baselinesUsed: 9,
    });

    expect(sitesQuotaLabel(quota)).toBe("7/∞");
    expect(checksQuotaLabel(quota)).toBe("8/∞");
    expect(baselineQuotaLabel(quota)).toBe("9/∞");
  });
});
