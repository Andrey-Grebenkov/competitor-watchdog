import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError, errorMessage } from "@/lib/errors";

export const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_VISION_MODEL = "gemini-3.6-flash";

/**
 * Приводит имя модели к виду, который принимает v1beta REST API:
 * снимает префикс `models/` (он добавляется в пути URL).
 */
function normalizeModel(model: string): string {
  return model.trim().replace(/^models\//, "");
}

export const VISION_MODEL = normalizeModel(
  process.env.GEMINI_MODEL?.trim() || DEFAULT_VISION_MODEL,
);

/** База без завершающих слешей — иначе Gemini отвечает 404. */
export const GEMINI_API_BASE = (
  process.env.GEMINI_API_BASE?.trim() || DEFAULT_GEMINI_API_BASE
).replace(/\/+$/, "");

/** Итоговый URL вызова модели. */
export function geminiEndpoint(model = VISION_MODEL): string {
  return `${GEMINI_API_BASE}/models/${normalizeModel(model)}:generateContent`;
}

export const AUTH_ERROR_MESSAGE =
  "Ошибка авторизации: проверьте GEMINI_API_KEY (или OPENAI_API_KEY) и GEMINI_API_BASE в .env";

export const changeSchema = z.object({
  type: z.string(),
  field: z.string(),
  from: z.string(),
  to: z.string(),
});

export const analysisSchema = z.object({
  hasChanges: z.boolean(),
  summary: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
  changes: z.array(changeSchema),
});

export type Change = z.infer<typeof changeSchema>;
export type AnalysisResult = z.infer<typeof analysisSchema>;

export class AiAnalysisError extends AppError {
  readonly name = "AiAnalysisError";
}

const SYSTEM_PROMPT = `You compare two screenshots of a competitor's web page: the first image is the previous state, the second is the current state.
Report only meaningful commercial changes (prices, discounts, promo banners, stock availability), ignoring rendering noise such as carousels, ads rotation or antialiasing.
Set urgency to "high" only for price changes or new promo campaigns, "medium" for stock or layout changes affecting offers, "low" otherwise.
When nothing meaningful changed, set hasChanges to false, changes to an empty array and summary to a short explanation.
Answer with a single JSON object and nothing else, using exactly this shape:
{"hasChanges": boolean, "summary": string, "urgency": "low" | "medium" | "high", "changes": [{"type": string, "field": string, "from": string, "to": string}]}`;

/** JSON-схема ответа для responseSchema Gemini. */
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    hasChanges: { type: "boolean" },
    summary: { type: "string" },
    urgency: { type: "string", enum: ["low", "medium", "high"] },
    changes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string" },
          field: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["type", "field", "from", "to"],
      },
    },
  },
  required: ["hasChanges", "summary", "urgency", "changes"],
} as const;

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(z.object({ text: z.string().optional() }))
              .optional(),
          })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z
    .object({ blockReason: z.string().optional() })
    .optional()
    .nullable(),
  error: z
    .object({ code: z.number().optional(), message: z.string().optional() })
    .optional(),
});

/** Ответ `GET /models` — только имена. */
const availableModelsSchema = z.object({
  models: z.array(z.object({ name: z.string().optional() })).optional(),
});

/** Количество повторных попыток. */
const AI_FETCH_RETRIES = 2;

/** Таймаут запроса к Gemini, мс. */
const AI_FETCH_TIMEOUT_MS = 60_000;

/** Таймаут вспомогательного запроса списка моделей, мс. */
const LIST_MODELS_TIMEOUT_MS = 10_000;

/** Максимальная длина логируемых ответов, символов. */
const MAX_LOG_LENGTH = 2000;

/**
 * Обрезает длинную строку до лимита, чтобы логи не разрастались
 * на нешлюзовых ответах.
 */
function truncate(value: string, max = MAX_LOG_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 10_000);
}

function isAuthMessage(message: string): boolean {
  return /api key not valid|invalid api key|api_key_invalid|unauthorized|permission denied|missing api key/i.test(
    message,
  );
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" ||
      (error as { code?: string }).code === "ABORT_ERR")
  );
}

interface GeminiErrorEnvelope {
  error?: {
    code?: number | string;
    message?: string;
    status?: string;
  };
}

function parseErrorEnvelope(rawBody: string): GeminiErrorEnvelope | null {
  try {
    return JSON.parse(rawBody.trim() || "{}") as GeminiErrorEnvelope;
  } catch {
    return null;
  }
}

/**
 * Проверяет, стоит ли повторять запрос при данном HTTP-ответе.
 * Повторяем 429, 5xx и UNAVAILABLE; 404 и ошибки авторизации — нет.
 */
function isRetriableHttpStatus(response: Response, rawBody: string): boolean {
  if (response.status === 429) return true;
  if (response.status >= 500 && response.status < 600) return true;

  const envelope = parseErrorEnvelope(rawBody);
  if (!envelope?.error) return false;

  const { message, status } = envelope.error;
  if (status === "UNAVAILABLE" || /unavailable/i.test(message ?? "")) return true;

  return false;
}

function extractErrorMessage(response: Response, rawBody: string): string {
  const envelope = parseErrorEnvelope(rawBody);
  return envelope?.error?.message ?? rawBody.slice(0, 2000);
}

/**
 * Пытается разобрать JSON напрямую (модель отдаёт application/json),
 * и только при неудаче достаёт JSON из markdown-обёртки ```json ... ```.
 * Убирает непечатаемые управляющие символы.
 */
function parseModelJson(content: string): unknown {
  const withoutControls = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/g, "")
    .trim();
  try {
    return JSON.parse(withoutControls);
  } catch {
    const fenced = withoutControls.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const extracted = (fenced ? fenced[1] : withoutControls).trim();
    return JSON.parse(extracted);
  }
}

async function toBase64(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    return buffer.toString("base64");
  } catch (error) {
    throw new AiAnalysisError(`Не удалось прочитать скриншот ${filePath}`, {
      cause: error,
    });
  }
}

/**
 * Диагностика на случай 404: печатает список моделей, доступных этому ключу.
 */
async function logAvailableModels(apiKey: string): Promise<void> {
  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
      { signal: AbortSignal.timeout(LIST_MODELS_TIMEOUT_MS) },
    );
    const rawBody = await response.text();
    const parsed = availableModelsSchema.safeParse(
      JSON.parse(rawBody.trim() || "{}"),
    );
    const availableModels = parsed.success
      ? (parsed.data.models ?? []).map((model) =>
          normalizeModel(model.name ?? ""),
        )
      : rawBody.slice(0, 500);
    console.error("Available Models:", JSON.stringify(availableModels));
  } catch (error) {
    console.error("Available Models:", JSON.stringify([]));
    console.error("Vision API Error Details:", error);
  }
}

export async function analyzeScreenshots(
  oldPath: string,
  newPath: string,
): Promise<AnalysisResult> {
  const apiKey =
    process.env.GEMINI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiAnalysisError(AUTH_ERROR_MESSAGE);
  }

  const [previousImage, currentImage] = await Promise.all([
    toBase64(oldPath),
    toBase64(newPath),
  ]);

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Previous screenshot:" },
          { inlineData: { mimeType: "image/png", data: previousImage } },
          { text: "Current screenshot:" },
          { inlineData: { mimeType: "image/png", data: currentImage } },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
    },
  });

  let response: Response | undefined;
  let rawBody = "";

  for (let attempt = 0; attempt <= AI_FETCH_RETRIES; attempt++) {
    try {
      response = await fetch(geminiEndpoint(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
        signal: AbortSignal.timeout(AI_FETCH_TIMEOUT_MS),
      });
      rawBody = await response.text();
    } catch (error) {
      if (isAbortError(error) && attempt < AI_FETCH_RETRIES) {
        console.error(
          `Vision API request timed out (attempt ${attempt + 1}), retrying after ${backoffMs(attempt)}ms...`,
        );
        await sleep(backoffMs(attempt));
        continue;
      }
      console.error("Vision API Error Details:", error);
      if (isAbortError(error)) {
        throw new AiAnalysisError("Vision API request timed out", {
          cause: error,
        });
      }
      throw new AiAnalysisError(
        `Vision API недоступен: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    if (isRetriableHttpStatus(response, rawBody) && attempt < AI_FETCH_RETRIES) {
      console.error(
        `Vision API вернул ошибку ${response.status}: ${truncate(extractErrorMessage(response, rawBody))}, retrying after ${backoffMs(attempt)}ms...`,
      );
      await sleep(backoffMs(attempt));
      continue;
    }

    break;
  }

  if (!response) {
    throw new AiAnalysisError("Vision API request timed out");
  }

  if (!rawBody || !rawBody.trim()) {
    console.error("Gemini Raw Response:", truncate(rawBody));
    if (!response.ok) {
      throw new AiAnalysisError(
        `Vision API вернул ошибку ${response.status} без тела ответа`,
      );
    }
    throw new AiAnalysisError("Vision API вернул пустой ответ");
  }

  let body: z.infer<typeof geminiResponseSchema>;
  try {
    body = geminiResponseSchema.parse(JSON.parse(rawBody.trim()));
  } catch (error) {
    console.error("Vision API Error Details:", error);
    console.error("Gemini Raw Response:", truncate(rawBody));
    if (!response.ok) {
      throw new AiAnalysisError(
        `Vision API вернул ошибку ${response.status}: ${truncate(rawBody)}`,
        { cause: error },
      );
    }
    throw new AiAnalysisError("Не удалось распарсить ответ Vision API");
  }

  if (!response.ok || body.error) {
    const message = truncate(body.error?.message ?? rawBody);
    console.error("Vision API Error Details:", response.status, message);
    if (
      response.status === 401 ||
      response.status === 403 ||
      isAuthMessage(message)
    ) {
      throw new AiAnalysisError(AUTH_ERROR_MESSAGE);
    }
    if (response.status === 404) {
      await logAvailableModels(apiKey);
      throw new AiAnalysisError(
        `Vision API вернул ошибку 404: модель ${VISION_MODEL} недоступна`,
      );
    }
    throw new AiAnalysisError(
      `Vision API вернул ошибку ${response.status}: ${message}`,
    );
  }

  const blockReason = body.promptFeedback?.blockReason;
  if (blockReason) {
    throw new AiAnalysisError(`Модель отклонила запрос: ${blockReason}`);
  }

  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    console.error(
      "Gemini Raw Response:",
      truncate(rawBody),
      "finishReason:",
      candidate?.finishReason,
    );
    throw new AiAnalysisError(
      candidate?.finishReason
        ? `Модель не вернула текст (finishReason: ${candidate.finishReason}).`
        : "Модель не вернула текст",
    );
  }

  let payload: unknown;
  try {
    payload = parseModelJson(text);
  } catch (error) {
    console.error("Vision API Error Details:", error);
    console.error("Gemini Raw Response:", truncate(text));
    throw new AiAnalysisError("Не удалось распарсить JSON-вердикт модели");
  }

  const validated = analysisSchema.safeParse(payload);
  if (!validated.success) {
    console.error("Vision API Error Details:", validated.error);
    console.error("Gemini Raw Response:", truncate(text));
    throw new AiAnalysisError("Вердикт модели не соответствует схеме");
  }

  return validated.data;
}
