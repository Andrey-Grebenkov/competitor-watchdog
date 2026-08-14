import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { AppError, errorMessage } from "@/lib/errors";

export const SCREENSHOT_DIR = "/tmp/screenshots";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const VIEWPORT = { width: 1280, height: 800 };

const NAVIGATION_TIMEOUT_MS = 60_000;

/** Пауза после domcontentloaded, чтобы страница успела отрисоваться. */
const RENDER_DELAY_MS = 2000;

export interface CaptureOptions {
  url: string;
  cssSelector?: string | null;
  timeoutMs?: number;
}

/** Сбой на этапе снятия скриншота (навигация, таймаут, селектор). */
export class ScrapeError extends AppError {
  readonly name = "ScrapeError";
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
  try {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
  } catch (error) {
    throw new ScrapeError(
      `Не удалось создать каталог для снимков ${SCREENSHOT_DIR}: ${errorMessage(error)}`,
      { cause: error },
    );
  }
  const screenshotPath = path.join(SCREENSHOT_DIR, `${randomUUID()}.png`);

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        // HTTP/1.1 устойчивее: часть сайтов рвёт HTTP/2-потоки ботам.
        "--disable-http2",
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

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(RENDER_DELAY_MS);

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
    const details = errorMessage(error);
    throw new ScrapeError(
      `Ошибка загрузки сайта (Playwright): ${details.split("\n")[0]}`,
      { cause: error },
    );
  } finally {
    // Ошибка закрытия не должна подменять исходную причину сбоя.
    try {
      await browser?.close();
    } catch (error) {
      console.error("Playwright Close Error Details:", error);
    }
  }
}
