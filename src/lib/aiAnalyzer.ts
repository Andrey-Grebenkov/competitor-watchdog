import { readFile } from "node:fs/promises";
import { z } from "zod";

export const DEFAULT_GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta";

export const DEFAULT_VISION_MODEL = "gemini-1.5-flash";

export const VISION_MODEL =
  process.env.GEMINI_MODEL?.trim() ||
  process.env.OPENAI_VISION_MODEL?.trim() ||
  DEFAULT_VISION_MODEL;

export const GEMINI_API_BASE =
  process.env.GEMINI_API_BASE?.trim() || DEFAULT_GEMINI_API_BASE;

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

export class AiAnalysisError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiAnalysisError";
  }
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

/** Убирает markdown-обёртку ```json ... ```, которую иногда добавляет модель. */
function stripCodeFence(content: string): string {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced ? fenced[1] : content).trim();
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

  const endpoint = `${GEMINI_API_BASE.replace(/\/$/, "")}/models/${VISION_MODEL}:generateContent`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
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
      }),
    });
  } catch (error) {
    console.error("Vision API Error Details:", error);
    throw new AiAnalysisError(
      `Vision API недоступен: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const rawBody = await response.text();
  let body: z.infer<typeof geminiResponseSchema>;
  try {
    body = geminiResponseSchema.parse(JSON.parse(rawBody));
  } catch (error) {
    console.error("Vision API Error Details:", error, rawBody.slice(0, 500));
    throw new AiAnalysisError(
      `Vision API вернул неожиданный ответ: ${rawBody.slice(0, 200)}`,
      { cause: error },
    );
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

  const text = body.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    throw new AiAnalysisError("Vision API вернул пустой ответ");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFence(text));
  } catch (error) {
    console.error("Vision API Error Details:", error, text.slice(0, 500));
    throw new AiAnalysisError(
      `Vision API вернул невалидный JSON: ${text.slice(0, 200)}`,
      { cause: error },
    );
  }

  try {
    return analysisSchema.parse(payload);
  } catch (error) {
    console.error("Vision API Error Details:", error, payload);
    throw new AiAnalysisError(
      `Ответ Vision API не соответствует ожидаемой схеме: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}
