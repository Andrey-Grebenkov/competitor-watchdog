import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentAdmin, isAdmin, requireAdmin } from "@/lib/admin";
import { getCurrentUser } from "@/lib/currentUser";
import { makeUser } from "@/test/factories";

vi.mock("@/lib/currentUser", () => ({
  getCurrentUser: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);

beforeEach(() => {
  getCurrentUserMock.mockReset();
});

describe("isAdmin", () => {
  it("checks the role", () => {
    expect(isAdmin(makeUser({ role: "ADMIN" }))).toBe(true);
    expect(isAdmin(makeUser({ role: "USER", isUnlimited: true }))).toBe(false);
  });
});

describe("getCurrentAdmin", () => {
  it("returns the admin user", async () => {
    const admin = makeUser({ role: "ADMIN" });
    getCurrentUserMock.mockResolvedValue(admin);
    await expect(getCurrentAdmin()).resolves.toBe(admin);
  });

  it("returns null for a non-admin and for an anonymous visitor", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());
    await expect(getCurrentAdmin()).resolves.toBeNull();

    getCurrentUserMock.mockResolvedValue(null);
    await expect(getCurrentAdmin()).resolves.toBeNull();
  });
});

describe("requireAdmin", () => {
  it("passes the admin through without a response", async () => {
    const admin = makeUser({ role: "ADMIN" });
    getCurrentUserMock.mockResolvedValue(admin);

    const result = await requireAdmin();

    expect(result.admin).toBe(admin);
    expect(result.response).toBeUndefined();
  });

  it("answers 401 without a session", async () => {
    getCurrentUserMock.mockResolvedValue(null);

    const { admin, response } = await requireAdmin();

    expect(admin).toBeUndefined();
    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "Не авторизован" });
  });

  it("answers 403 for a signed-in non-admin", async () => {
    getCurrentUserMock.mockResolvedValue(makeUser());

    const { admin, response } = await requireAdmin();

    expect(admin).toBeUndefined();
    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({
      error: "Доступ запрещён",
    });
  });
});
