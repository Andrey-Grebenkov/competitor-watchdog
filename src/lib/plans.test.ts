import { describe, expect, it } from "vitest";
import {
  PLAN_LIMITS,
  hasUnlimitedAccess,
  planFor,
  planLabel,
  planNameFor,
} from "@/lib/plans";
import { makeUser } from "@/test/factories";

describe("hasUnlimitedAccess", () => {
  it("is true for admins and for flagged users", () => {
    expect(hasUnlimitedAccess(makeUser({ role: "ADMIN" }))).toBe(true);
    expect(hasUnlimitedAccess(makeUser({ isUnlimited: true }))).toBe(true);
  });

  it("is false for a regular premium user", () => {
    expect(
      hasUnlimitedAccess(makeUser({ subscriptionStatus: "premium" })),
    ).toBe(false);
  });
});

describe("planNameFor", () => {
  it("prefers unlimited over the subscription status", () => {
    const user = makeUser({ subscriptionStatus: "premium", role: "ADMIN" });
    expect(planNameFor(user)).toBe("unlimited");
  });

  it("maps subscriptionStatus to premium or free", () => {
    expect(planNameFor(makeUser({ subscriptionStatus: "premium" }))).toBe(
      "premium",
    );
    expect(planNameFor(makeUser({ subscriptionStatus: "free" }))).toBe("free");
    expect(planNameFor(makeUser({ subscriptionStatus: "trial" }))).toBe("free");
  });
});

describe("planFor", () => {
  it("returns the limits of the resolved plan", () => {
    expect(planFor(makeUser())).toBe(PLAN_LIMITS.free);
    expect(planFor(makeUser({ subscriptionStatus: "premium" }))).toBe(
      PLAN_LIMITS.premium,
    );
    expect(planFor(makeUser({ isUnlimited: true }))).toBe(
      PLAN_LIMITS.unlimited,
    );
  });
});

describe("PLAN_LIMITS", () => {
  it("keeps unlimited quotas as null and free quotas finite", () => {
    expect(PLAN_LIMITS.unlimited.maxDailyChecks).toBeNull();
    expect(PLAN_LIMITS.unlimited.maxDailyBaselines).toBeNull();
    expect(PLAN_LIMITS.premium.maxDailyBaselines).toBeNull();
    expect(PLAN_LIMITS.free.maxDailyChecks).toBe(2);
    expect(PLAN_LIMITS.free.maxDailyBaselines).toBe(5);
  });

  it("never lets a paid plan be stricter than free", () => {
    expect(PLAN_LIMITS.premium.maxSites).toBeGreaterThan(
      PLAN_LIMITS.free.maxSites,
    );
    expect(PLAN_LIMITS.premium.minIntervalHours).toBeLessThan(
      PLAN_LIMITS.free.minIntervalHours,
    );
  });
});

describe("planLabel", () => {
  it("returns a human readable label for every plan", () => {
    expect(planLabel("free")).toBe("Free");
    expect(planLabel("premium")).toBe("Premium");
    expect(planLabel("unlimited")).toBe("Unlimited");
  });
});
