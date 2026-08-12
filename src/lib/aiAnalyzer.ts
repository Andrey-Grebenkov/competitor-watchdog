import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { z } from "zod";

/** OpenAI-совместимый endpoint Gemini используется по умолчанию. */
export const DEFAULT_VISION_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/";

export const DEFAULT_VISION_MODEL = "gemini-1.5-flash";

export const VISION_MODEL =
  process.env.OPENAI_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

export const VISION_BASE_URL =
  process.env.OPENAI_BASE_URL?.trim() || DEFAULT_VISION_BASE_URL;

export const AUTH_ERROR_MESSAGE =
  "Ошибка авторизации: проверьте OPENAI_API_KEY и OPENAI_BASE_URL в .env";

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

/** Убирает markdown-обёртку ```json ... ```, которую иногда добавляет модель. */
function stripCodeFence(content: string): string {
  const fenced = content.trim().match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  return (fenced ? fenced[1] : content).trim();
}

/** Ошибка ключа/доступа: статус 401/403 или явное сообщение провайдера. */
function isAuthError(error: unknown): boolean {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      return true;
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return /api key not valid|invalid api key|api_key_invalid|unauthorized|permission denied/i.test(
    message,
  );
}

async function toDataUrl(filePath: string): Promise<string> {
  try {
    const buffer = await readFile(filePath);
    return `data:image/png;base64,${buffer.toString("base64")}`;
  } catch (error) {
    throw new AiAnalysisError(`Failed to read screenshot at ${filePath}`, {
      cause: error,
    });
  }
}

export async function analyzeScreenshots(
  oldPath: string,
  newPath: string,
): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new AiAnalysisError(AUTH_ERROR_MESSAGE);
  }

  const [previousImage, currentImage] = await Promise.all([
    toDataUrl(oldPath),
    toDataUrl(newPath),
  ]);

  const client = new OpenAI({ apiKey, baseURL: VISION_BASE_URL });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: VISION_MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: "Previous screenshot:" },
            { type: "image_url", image_url: { url: previousImage } },
            { type: "text", text: "Current screenshot:" },
            { type: "image_url", image_url: { url: currentImage } },
          ],
        },
      ],
    });
  } catch (error) {
    console.error("Vision API Error Details:", error);
    if (isAuthError(error)) {
      throw new AiAnalysisError(AUTH_ERROR_MESSAGE, { cause: error });
    }
    throw new AiAnalysisError("Vision API request failed", { cause: error });
  }

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new AiAnalysisError(`Model refused the request: ${message.refusal}`);
  }

  const content = message?.content;
  if (!content) {
    throw new AiAnalysisError("Vision API вернул пустой ответ");
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stripCodeFence(content));
  } catch (error) {
    console.error("Vision API Error Details:", error, content);
    throw new AiAnalysisError(
      `Vision API вернул невалидный JSON: ${content.slice(0, 200)}`,
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
