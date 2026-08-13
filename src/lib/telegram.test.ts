import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type TelegramModule = typeof import("@/lib/telegram");

/** Модуль читает TELEGRAM_API_BASE при загрузке, поэтому импортируем заново. */
async function loadTelegram(): Promise<TelegramModule> {
  vi.resetModules();
  return import("@/lib/telegram");
}

const fetchMock = vi.fn<typeof fetch>();

function okResponse(): Response {
  return new Response("{}", { status: 200 });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TELEGRAM_API_BASE", "https://tg.test");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "token-123");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isTelegramConfigured", () => {
  it("reflects the presence of the bot token", async () => {
    const { isTelegramConfigured } = await loadTelegram();
    expect(isTelegramConfigured()).toBe(true);

    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    expect(isTelegramConfigured()).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("escapes the characters Telegram parses as markup", async () => {
    const { escapeHtml } = await loadTelegram();
    expect(escapeHtml('<b>A&B</b> "x"')).toBe(
      '&lt;b&gt;A&amp;B&lt;/b&gt; "x"',
    );
  });

  it("escapes ampersands before angle brackets", async () => {
    const { escapeHtml } = await loadTelegram();
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("sendTelegramMessage", () => {
  it("posts an HTML message to the bot endpoint", async () => {
    const { sendTelegramMessage } = await loadTelegram();
    fetchMock.mockResolvedValue(okResponse());

    await sendTelegramMessage({ chatId: "42", text: "hello" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://tg.test/bottoken-123/sendMessage");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "42",
      text: "hello",
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: false,
    });
  });

  it("forwards disableNotification", async () => {
    const { sendTelegramMessage } = await loadTelegram();
    fetchMock.mockResolvedValue(okResponse());

    await sendTelegramMessage({
      chatId: "42",
      text: "hello",
      disableNotification: true,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      disable_notification: true,
    });
  });

  it("falls back to the public API base when the env var is unset", async () => {
    vi.stubEnv("TELEGRAM_API_BASE", undefined);
    const { sendTelegramMessage } = await loadTelegram();
    fetchMock.mockResolvedValue(okResponse());

    await sendTelegramMessage({ chatId: "42", text: "hello" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.telegram.org/bottoken-123/sendMessage",
    );
  });

  it("throws without a bot token and does not call the API", async () => {
    const { sendTelegramMessage, TelegramError } = await loadTelegram();
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");

    await expect(
      sendTelegramMessage({ chatId: "42", text: "hello" }),
    ).rejects.toThrow(TelegramError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("wraps network failures into TelegramError with the cause", async () => {
    const { sendTelegramMessage, TelegramError } = await loadTelegram();
    const cause = new Error("ECONNRESET");
    fetchMock.mockRejectedValue(cause);

    const error = await sendTelegramMessage({
      chatId: "42",
      text: "hello",
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(TelegramError);
    expect((error as Error).message).toBe("Telegram request failed");
    expect((error as Error).cause).toBe(cause);
  });

  it("reports the API status and body on a non-2xx answer", async () => {
    const { sendTelegramMessage } = await loadTelegram();
    fetchMock.mockResolvedValue(
      new Response("chat not found", { status: 400 }),
    );

    await expect(
      sendTelegramMessage({ chatId: "42", text: "hello" }),
    ).rejects.toThrow("Telegram API returned 400: chat not found");
  });

  it("falls back to the status text when the error body is empty", async () => {
    const { sendTelegramMessage } = await loadTelegram();
    fetchMock.mockResolvedValue(
      new Response("", { status: 500, statusText: "Server Error" }),
    );

    await expect(
      sendTelegramMessage({ chatId: "42", text: "hello" }),
    ).rejects.toThrow("Telegram API returned 500: Server Error");
  });
});
