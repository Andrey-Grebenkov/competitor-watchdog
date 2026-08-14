import type { User, WatchedSite } from "@prisma/client";

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user@example.com",
    passwordHash: null,
    name: null,
    image: null,
    emailVerified: null,
    subscriptionStatus: "free",
    role: "USER",
    isUnlimited: false,
    telegramChatId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function makeSite(overrides: Partial<WatchedSite> = {}): WatchedSite {
  return {
    id: "site-1",
    userId: "user-1",
    url: "https://competitor.example/pricing",
    name: "Competitor",
    cssSelector: null,
    checkIntervalHours: 24,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}
