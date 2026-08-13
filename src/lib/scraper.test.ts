import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SCREENSHOT_DIR, ScrapeError, captureScreenshot } from "@/lib/scraper";

vi.mock("node:fs/promises", () => ({ mkdir: vi.fn() }));
vi.mock("playwright", () => ({ chromium: { launch: vi.fn() } }));

const launchMock = vi.mocked(chromium.launch);
const mkdirMock = vi.mocked(mkdir);

interface PageStub {
  addInitScript: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  locator: ReturnType<typeof vi.fn>;
}

function makeBrowser() {
  const element = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
  };
  const page: PageStub = {
    addInitScript: vi.fn().mockResolvedValue(undefined),
    goto: vi.fn().mockResolvedValue(null),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    screenshot: vi.fn().mockResolvedValue(Buffer.from("")),
    locator: vi.fn(() => ({ first: () => element })),
  };
  const newContext = vi.fn().mockResolvedValue({
    newPage: vi.fn().mockResolvedValue(page),
  });
  const close = vi.fn().mockResolvedValue(undefined);
  return { browser: { newContext, close }, page, element, close };
}

beforeEach(() => {
  launchMock.mockReset();
  mkdirMock.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("captureScreenshot", () => {
  it("captures the full page into the screenshot dir and closes the browser", async () => {
    const { browser, page, close } = makeBrowser();
    launchMock.mockResolvedValue(browser as never);

    const result = await captureScreenshot({ url: "https://a.test" });

    expect(mkdirMock).toHaveBeenCalledWith(SCREENSHOT_DIR, { recursive: true });
    expect(result.usedSelector).toBe(false);
    expect(result.screenshotPath.startsWith(`${SCREENSHOT_DIR}/`)).toBe(true);
    expect(result.screenshotPath.endsWith(".png")).toBe(true);
    expect(result.capturedAt).toBeInstanceOf(Date);
    expect(page.goto).toHaveBeenCalledWith("https://a.test", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    expect(page.screenshot).toHaveBeenCalledWith({
      path: result.screenshotPath,
      fullPage: true,
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("launches Chromium with HTTP/2 disabled and stealth flags", async () => {
    const { browser } = makeBrowser();
    launchMock.mockResolvedValue(browser as never);

    await captureScreenshot({ url: "https://a.test" });

    const args = launchMock.mock.calls[0][0]?.args ?? [];
    expect(args).toContain("--disable-http2");
    expect(args).toContain("--disable-blink-features=AutomationControlled");
  });

  it("waits for the selector and shoots the element only", async () => {
    const { browser, page, element } = makeBrowser();
    launchMock.mockResolvedValue(browser as never);

    const result = await captureScreenshot({
      url: "https://a.test",
      cssSelector: ".price",
      timeoutMs: 5_000,
    });

    expect(result.usedSelector).toBe(true);
    expect(page.locator).toHaveBeenCalledWith(".price");
    expect(element.waitFor).toHaveBeenCalledWith({
      state: "visible",
      timeout: 5_000,
    });
    expect(element.screenshot).toHaveBeenCalledWith({
      path: result.screenshotPath,
    });
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("wraps a navigation failure into ScrapeError keeping only the first line", async () => {
    const { browser, page, close } = makeBrowser();
    const cause = new Error("net::ERR_HTTP2_SERVER_REFUSED_STREAM\nCall log:\n  - x");
    page.goto.mockRejectedValue(cause);
    launchMock.mockResolvedValue(browser as never);

    const error = await captureScreenshot({ url: "https://a.test" }).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ScrapeError);
    expect((error as Error).message).toBe(
      "Ошибка загрузки сайта (Playwright): net::ERR_HTTP2_SERVER_REFUSED_STREAM",
    );
    expect((error as Error).cause).toBe(cause);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("wraps a browser launch failure without a browser to close", async () => {
    launchMock.mockRejectedValue("chromium is not installed");

    await expect(captureScreenshot({ url: "https://a.test" })).rejects.toThrow(
      "Ошибка загрузки сайта (Playwright): chromium is not installed",
    );
  });
});
