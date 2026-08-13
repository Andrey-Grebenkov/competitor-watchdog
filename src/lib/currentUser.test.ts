import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { makeUser } from "@/test/factories";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const authMock = vi.mocked(auth) as unknown as ReturnType<typeof vi.fn>;
const findUniqueMock = vi.mocked(prisma.user.findUnique);

beforeEach(() => {
  authMock.mockReset();
  findUniqueMock.mockReset();
});

describe("getCurrentUser", () => {
  it("loads the user of the current session", async () => {
    const user = makeUser();
    authMock.mockResolvedValue({ user: { id: user.id } });
    findUniqueMock.mockResolvedValue(user as never);

    await expect(getCurrentUser()).resolves.toBe(user);
    expect(findUniqueMock).toHaveBeenCalledWith({ where: { id: user.id } });
  });

  it("returns null without a session or without a user id", async () => {
    authMock.mockResolvedValue(null);
    await expect(getCurrentUser()).resolves.toBeNull();

    authMock.mockResolvedValue({ user: {} });
    await expect(getCurrentUser()).resolves.toBeNull();

    expect(findUniqueMock).not.toHaveBeenCalled();
  });
});
