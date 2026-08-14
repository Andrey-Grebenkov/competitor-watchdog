import { readFile } from "node:fs/promises";
import { z } from "zod";
import { AppError, errorMessage } from "@/lib/errors";

export const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_VISION_MODEL = "gemini-2.0-flash";

/** Запасные модели, если основная недоступна (404 от провайдера). */
export const FALLBACK_VISION_MODELS = [
  DEFAULT_VISION_MODEL,
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-lite",
] as const;

/**
 * Приводит имя модели к виду, который принимает v1beta REST API: снимает
 * префикс `models/` (он добавляется в пути URL) и дополняет `gemini-1.5-flash`
 * до `gemini-1.5-flash-latest`.
 */
function normalizeModel(model: string): string {
  const name = model.trim().replace(/^models\//, "");
  return name === "gemini-1.5-flash" ? "gemini-1.5-flash-latest" : name;
}

export const VISION_MODEL = normalizeModel(
  process.env.GEMINI_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    DEFAULT_VISION_MODEL,
);

/** Модели в порядке попыток, без повторов. */
export const VISION_MODEL_CHAIN: string[] = [
  ...new Set([VISION_MODEL, ...FALLBACK_VISION_MODELS]),
];

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

/**
 * Вердикт на случай, когда ответ модели пуст или не разбирается: проверка
 * завершается успешно и пайплайн не ломается.
 */
export const UNPARSEABLE_ANALYSIS: AnalysisResult = {
  hasChanges: false,
  summary: "Не удалось распарсить текстовый ответ от ИИ.",
  urgency: "low",
  changes: [],
};

/**
 * Готовит текст к `JSON.parse`: снимает markdown-обёртку ```json ... ``` (даже
 * если вокруг есть пояснения) и убирает непечатаемые управляющие символы.
 */
function cleanJsonText(content: string): string {
  const withoutControls = content
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufeff]/g, "")
    .trim();
  const fenced = withoutControls.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : withoutControls).trim();
}

function isAuthMessage(message: string): boolean {
  return /api key not valid|invalid api key|api_key_invalid|unauthorized|permission denied|missing api key/i.test(
    message,
  );
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
 * Диагностика на случай, когда все модели цепочки отдали 404: печатает список
 * моделей, доступных этому ключу.
 */
async function logAvailableModels(apiKey: string): Promise<void> {
  try {
    const response = await fetch(
      `${GEMINI_API_BASE}/models?key=${encodeURIComponent(apiKey)}`,
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
  for (const [index, model] of VISION_MODEL_CHAIN.entries()) {
    try {
      response = await fetch(geminiEndpoint(model), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: requestBody,
      });
    } catch (error) {
      console.error("Vision API Error Details:", error);
      throw new AiAnalysisError(
        `Vision API недоступен: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    try {
      rawBody = await response.text();
    } catch (error) {
      console.error("Vision API Error Details:", error);
      throw new AiAnalysisError(
        `Не удалось прочитать ответ Vision API: ${errorMessage(error)}`,
        { cause: error },
      );
    }

    if (response.status !== 404) {
      break;
    }

    const next = VISION_MODEL_CHAIN[index + 1];
    console.error(
      "Vision API Error Details:",
      next
        ? `модель ${model} недоступна (404), пробуем ${next}`
        : `модель ${model} недоступна (404), фолбэки исчерпаны`,
    );
    if (!next) {
      await logAvailableModels(apiKey);
    }
  }

  if (!response) {
    throw new AiAnalysisError("Vision API не вернул ответ");
  }

  if (!rawBody || !rawBody.trim()) {
    console.error("Gemini Raw Response:", rawBody);
    if (!response.ok) {
      throw new AiAnalysisError(
        `Vision API вернул ошибку ${response.status} без тела ответа`,
      );
    }
    return UNPARSEABLE_ANALYSIS;
  }

  let body: z.infer<typeof geminiResponseSchema>;
  try {
    // Конверт от Google — обычный JSON; чистка нужна только для текста модели,
    // иначе fence внутри строки ответа сломает разбор конверта.
    body = geminiResponseSchema.parse(JSON.parse(rawBody.trim()));
  } catch (error) {
    console.error("Vision API Error Details:", error);
    console.error("Gemini Raw Response:", rawBody);
    if (!response.ok) {
      throw new AiAnalysisError(
        `Vision API вернул ошибку ${response.status}: ${rawBody.slice(0, 200)}`,
        { cause: error },
      );
    }
    return UNPARSEABLE_ANALYSIS;
  }

  if (!response.ok || body.error) {
    const message = body.error?.message ?? rawBody.slice(0, 200);
    console.error("Vision API Error Details:", response.status, message);
    if (
      response.status === 401 ||
      response.status === 403 ||
      isAuthMessage(message)
    ) {
      throw new AiAnalysisError(AUTH_ERROR_MESSAGE);
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
      rawBody,
      "finishReason:",
      candidate?.finishReason,
    );
    // Пустой ответ чаще всего значит SAFETY или MAX_TOKENS — причина
    // попадает в вердикт, иначе в UI видно только «не удалось распарсить».
    return candidate?.finishReason
      ? {
          ...UNPARSEABLE_ANALYSIS,
          summary: `Модель не вернула текст (finishReason: ${candidate.finishReason}).`,
        }
      : UNPARSEABLE_ANALYSIS;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(cleanJsonText(text));
  } catch (error) {
    console.error("Vision API Error Details:", error);
    console.error("Gemini Raw Response:", text);
    return UNPARSEABLE_ANALYSIS;
  }

  const validated = analysisSchema.safeParse(payload);
  if (!validated.success) {
    console.error("Vision API Error Details:", validated.error);
    console.error("Gemini Raw Response:", text);
    return UNPARSEABLE_ANALYSIS;
  }

  return validated.data;
}
