import { z } from "zod";
import { AppError } from "@/lib/errors";

const TELEGRAM_API_BASE =
  process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org";

const responseSchema = z.object({
  ok: z.boolean(),
  description: z.string().optional(),
});

function safeJsonParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export class TelegramError extends AppError {
  readonly name = "TelegramError";
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
  let body: string;
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
    body = await response.text();
  } catch (error) {
    throw new TelegramError("Telegram request failed", { cause: error });
  }

  if (!response.ok) {
    throw new TelegramError(
      `Telegram API returned ${response.status}: ${body || response.statusText}`,
    );
  }

  // Telegram сообщает о части ошибок (неверный chat_id, битый HTML) кодом 200
  // и телом `{"ok": false, ...}` — без разбора тела такой сбой теряется.
  const parsed = responseSchema.safeParse(safeJsonParse(body));
  if (!parsed.success) {
    throw new TelegramError(
      `Telegram API returned unexpected body: ${body.slice(0, 200)}`,
      { cause: parsed.error },
    );
  }
  if (!parsed.data.ok) {
    throw new TelegramError(
      `Telegram API rejected the message: ${parsed.data.description ?? body.slice(0, 200)}`,
    );
  }
}
