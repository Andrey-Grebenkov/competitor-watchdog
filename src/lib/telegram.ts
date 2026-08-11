const TELEGRAM_API_BASE = "https://api.telegram.org";

export class TelegramError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TelegramError";
  }
}

export interface SendMessageOptions {
  chatId: string;
  text: string;
  disableNotification?: boolean;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramMessage({
  chatId,
  text,
  disableNotification = false,
}: SendMessageOptions): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new TelegramError("TELEGRAM_BOT_TOKEN is not set");
  }

  let response: Response;
  try {
    response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        disable_notification: disableNotification,
      }),
    });
  } catch (error) {
    throw new TelegramError("Telegram request failed", { cause: error });
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new TelegramError(
      `Telegram API returned ${response.status}: ${body || response.statusText}`,
    );
  }
}
