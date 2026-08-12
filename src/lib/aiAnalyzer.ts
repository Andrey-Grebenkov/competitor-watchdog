import { readFile } from "node:fs/promises";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

export const VISION_MODEL = process.env.OPENAI_VISION_MODEL ?? "gpt-4o";

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
When nothing meaningful changed, set hasChanges to false, changes to an empty array and summary to a short explanation.`;

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
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AiAnalysisError("OPENAI_API_KEY is not set");
  }

  const [previousImage, currentImage] = await Promise.all([
    toDataUrl(oldPath),
    toDataUrl(newPath),
  ]);

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
  });

  let completion;
  try {
    completion = await client.chat.completions.parse({
      model: VISION_MODEL,
      response_format: zodResponseFormat(analysisSchema, "page_diff_analysis"),
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
    throw new AiAnalysisError("Vision API request failed", { cause: error });
  }

  const message = completion.choices[0]?.message;
  if (message?.refusal) {
    throw new AiAnalysisError(`Model refused the request: ${message.refusal}`);
  }

  const parsed = message?.parsed;
  if (!parsed) {
    throw new AiAnalysisError(
      `Model returned no parseable JSON: ${message?.content ?? "empty response"}`,
    );
  }

  const validated = analysisSchema.safeParse(parsed);
  if (!validated.success) {
    throw new AiAnalysisError(
      `Model response does not match the expected schema: ${validated.error.message}`,
    );
  }

  return validated.data;
}
