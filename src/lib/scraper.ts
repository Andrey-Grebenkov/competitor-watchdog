import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser, type Page, type Route } from "playwright";
import { assertPublicUrl, BlockedUrlError, isPublicUrl } from "@/lib/urlGuard";

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

/** Максимум редиректов, которые разрешено пройти при навигации. */
const MAX_REDIRECTS = 10;

/**
 * Загружает документ, проходя редиректы вручную и проверяя каждый переход:
 * Chromium следует за 3xx внутри себя, поэтому обработчик `page.route` для
 * целевого адреса уже не вызывается и одной проверки запроса недостаточно —
 * `https://public.example/redirect?to=http://127.0.0.1` иначе снимал бы
 * скриншот внутреннего сервиса.
 */
async function fetchFollowingSafeRedirects(route: Route): Promise<void> {
  let currentUrl = route.request().url();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await route.fetch({ url: currentUrl, maxRedirects: 0 });
    const status = response.status();
    const location = response.headers().location;
    if (status < 300 || status > 399 || !location) {
      await route.fulfill({ response });
      return;
    }

    const nextUrl = new URL(location, currentUrl).toString();
    if (!(await isPublicUrl(nextUrl))) {
      await route.abort("blockedbyclient");
      return;
    }
    currentUrl = nextUrl;
  }

  await route.abort("blockedbyclient");
}

/**
 * Отсекает любые запросы страницы на адреса внутренней сети — и навигацию
 * (включая редиректы), и подгружаемые ресурсы, которые иначе попали бы в
 * скриншот.
 */
async function blockPrivateRequests(page: Page): Promise<void> {
  await page.route("**/*", async (route: Route) => {
    const request = route.request();
    if (!(await isPublicUrl(request.url()))) {
      await route.abort("blockedbyclient");
      return;
    }
    if (request.resourceType() !== "document") {
      await route.continue();
      return;
    }

    try {
      await fetchFollowingSafeRedirects(route);
    } catch (error) {
      console.error("Playwright Error Details:", error);
      await route.abort("failed");
    }
  });
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
    await assertPublicUrl(url);
  } catch (error) {
    if (error instanceof BlockedUrlError) {
      throw new ScrapeError(`Адрес недоступен для проверки: ${error.message}`, {
        cause: error,
      });
    }
    throw error;
  }

  await mkdir(SCREENSHOT_DIR, { recursive: true });
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
    await blockPrivateRequests(page);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    // Последний барьер: даже если переход прошёл мимо перехвата (JS-redirect,
    // meta refresh), во внутреннюю сеть скриншот не снимаем.
    if (!(await isPublicUrl(page.url()))) {
      throw new BlockedUrlError("редирект во внутреннюю сеть");
    }
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
    if (error instanceof BlockedUrlError) {
      throw new ScrapeError(`Адрес недоступен для проверки: ${error.message}`, {
        cause: error,
      });
    }
    console.error("Playwright Error Details:", error);
    const details = error instanceof Error ? error.message : String(error);
    if (details.includes("ERR_BLOCKED_BY_CLIENT")) {
      throw new ScrapeError(
        "Адрес недоступен для проверки: редирект во внутреннюю сеть",
        { cause: error },
      );
    }
    throw new ScrapeError(
      `Ошибка загрузки сайта (Playwright): ${details.split("\n")[0]}`,
      { cause: error },
    );
  } finally {
    await browser?.close();
  }
}
