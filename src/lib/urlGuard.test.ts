import { describe, expect, it } from "vitest";
import { BlockedUrlError, assertPublicUrl, isPublicUrl } from "@/lib/urlGuard";

describe("assertPublicUrl", () => {
  it("keeps a public address", async () => {
    const parsed = await assertPublicUrl("https://93.184.216.34/price");
    expect(parsed.pathname).toBe("/price");
  });

  it.each([
    "ftp://example.com/",
    "file:///etc/passwd",
    "http://127.0.0.1:3000/",
    "http://localhost/",
    "http://10.0.0.1/",
    "http://192.168.1.1/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fd00::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://2130706433/",
    "http://0177.0.0.1/",
    "http://db.internal/",
    "not a url",
  ])("blocks %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toBeInstanceOf(BlockedUrlError);
  });
});

describe("isPublicUrl", () => {
  it("reports blocked addresses without throwing", async () => {
    await expect(isPublicUrl("http://169.254.169.254/")).resolves.toBe(false);
    await expect(isPublicUrl("https://93.184.216.34/")).resolves.toBe(true);
  });
});
