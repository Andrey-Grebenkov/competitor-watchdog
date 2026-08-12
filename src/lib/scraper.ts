import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";

export const SCREENSHOT_DIR = "/tmp/screenshots";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const VIEWPORT = { width: 1280, height: 800 };

const NAVIGATION_TIMEOUT_MS = 60_000;

export interface CaptureOptions {
  url: string;
  cssSelector?: string | null;
  timeoutMs?: number;
}

/** Сбой на этапе снятия скриншота (навигация, таймаут, селектор). */
export class ScrapeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ScrapeError";
  }
}

export interface CaptureResult {
  screenshotPath: string;
  capturedAt: Date;
  usedSelector: boolean;
}

async function applyStealth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "languages", {
      get: () => ["en-US", "en"],
    });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
  });
}

export async function captureScreenshot({
  url,
  cssSelector,
  timeoutMs = NAVIGATION_TIMEOUT_MS,
}: CaptureOptions): Promise<CaptureResult> {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  const screenshotPath = path.join(SCREENSHOT_DIR, `${randomUUID()}.png`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: VIEWPORT,
      locale: "en-US",
      timezoneId: "Europe/Moscow",
      deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    await applyStealth(page);

    await page.goto(url, { waitUntil: "networkidle", timeout: timeoutMs });

    if (cssSelector) {
      const element = page.locator(cssSelector).first();
      await element.waitFor({ state: "visible", timeout: timeoutMs });
      await element.screenshot({ path: screenshotPath });
    } else {
      await page.screenshot({ path: screenshotPath, fullPage: true });
    }

    return {
      screenshotPath,
      capturedAt: new Date(),
      usedSelector: Boolean(cssSelector),
    };
  } catch (error) {
    console.error("Playwright Error Details:", error);
    const details = error instanceof Error ? error.message : String(error);
    throw new ScrapeError(
      `Ошибка загрузки сайта (Playwright): ${details.split("\n")[0]}`,
      { cause: error },
    );
  } finally {
    await browser?.close();
  }
}
