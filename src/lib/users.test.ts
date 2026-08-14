import { describe, expect, it } from "vitest";
import { getUserInitials, serializeUser } from "@/lib/users";
import { makeUser } from "@/test/factories";

describe("getUserInitials", () => {
  it("returns first two letters of the email when name is absent", () => {
    expect(getUserInitials(null, "admin@example.com")).toBe("AD");
  });

  it("returns initials from a two-word name", () => {
    expect(getUserInitials("Иван Петров", "ivan@example.com")).toBe("ИП");
  });

  it("returns first two letters of a single-word name", () => {
    expect(getUserInitials("Анна", "anna@example.com")).toBe("АН");
  });

  it("falls back to the email for an empty or whitespace name", () => {
    expect(getUserInitials("", "user@example.com")).toBe("US");
    expect(getUserInitials("   ", "user@example.com")).toBe("US");
  });
});

describe("serializeUser", () => {
  it("includes the plan label", () => {
    const user = makeUser({ subscriptionStatus: "premium" });
    const result = serializeUser(user);
    expect(result.plan).toBe("Premium");
    expect(result.email).toBe(user.email);
  });
});
