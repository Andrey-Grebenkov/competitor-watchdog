import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type AiAnalyzerModule = typeof import("@/lib/aiAnalyzer");

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

const readFileMock = vi.mocked(readFile);
const fetchMock = vi.fn<typeof fetch>();

/** Модуль читает env при загрузке, поэтому импортируем его заново в каждом тесте. */
async function loadAnalyzer(
  env: Record<string, string> = {},
): Promise<AiAnalyzerModule> {
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  return import("@/lib/aiAnalyzer");
}

function geminiResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status });
}

function candidate(text: string): unknown {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

const VERDICT = {
  hasChanges: true,
  summary: "Цена снизилась",
  urgency: "high" as const,
  changes: [{ type: "price", field: "Основной тариф", from: "100", to: "90" }],
};

beforeEach(() => {
  readFileMock.mockReset().mockResolvedValue(Buffer.from("png-bytes"));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("GEMINI_API_KEY", "key-1");
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("GEMINI_API_BASE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("geminiEndpoint", () => {
  it("uses the documented defaults", async () => {
    const { geminiEndpoint, DEFAULT_GEMINI_API_BASE, DEFAULT_VISION_MODEL } =
      await loadAnalyzer();

    expect(geminiEndpoint()).toBe(
      `${DEFAULT_GEMINI_API_BASE}/models/${DEFAULT_VISION_MODEL}:generateContent`,
    );
  });

  it("drops trailing slashes from the base URL", async () => {
    const { geminiEndpoint } = await loadAnalyzer({
      GEMINI_API_BASE: "https://gem.test/v1beta///",
    });

    expect(geminiEndpoint("gemini-3.6-flash")).toBe(
      "https://gem.test/v1beta/models/gemini-3.6-flash:generateContent",
    );
  });

  it("strips a models/ prefix", async () => {
    const { geminiEndpoint } = await loadAnalyzer({
      GEMINI_API_BASE: "https://gem.test/v1beta",
    });

    expect(geminiEndpoint("models/gemini-3.6-flash")).toBe(
      "https://gem.test/v1beta/models/gemini-3.6-flash:generateContent",
    );
  });

  it("uses the configured model", async () => {
    const { VISION_MODEL, geminiEndpoint } = await loadAnalyzer({
      GEMINI_MODEL: " gemini-custom ",
    });

    expect(VISION_MODEL).toBe("gemini-custom");
    expect(geminiEndpoint()).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-custom:generateContent",
    );
  });
});

describe("analyzeScreenshots", () => {
  it("sends both screenshots as inline base64 PNG data", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    readFileMock.mockResolvedValueOnce(Buffer.from("old"));
    readFileMock.mockResolvedValueOnce(Buffer.from("new"));
    fetchMock.mockResolvedValue(
      geminiResponse(candidate(JSON.stringify(VERDICT))),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).resolves.toEqual(
      VERDICT,
    );

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "key-1",
    );
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(
      body.contents[0].parts
        .filter((part: { inlineData?: unknown }) => part.inlineData)
        .map((part: { inlineData: { data: string } }) => part.inlineData.data),
    ).toEqual([
      Buffer.from("old").toString("base64"),
      Buffer.from("new").toString("base64"),
    ]);
  });

  it("accepts OPENAI_API_KEY as a fallback key", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "legacy-key");
    fetchMock.mockResolvedValue(
      geminiResponse(candidate(JSON.stringify(VERDICT))),
    );

    await analyzeScreenshots("/old.png", "/new.png");

    const [, init] = fetchMock.mock.calls[0];
    expect((init?.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "legacy-key",
    );
  });

  it("fails with the auth hint when no API key is configured", async () => {
    const { analyzeScreenshots, AiAnalysisError, AUTH_ERROR_MESSAGE } =
      await loadAnalyzer();
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const error = await analyzeScreenshots("/old.png", "/new.png").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AiAnalysisError);
    expect((error as Error).message).toBe(AUTH_ERROR_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails when a screenshot cannot be read", async () => {
    const { analyzeScreenshots, AiAnalysisError } = await loadAnalyzer();
    readFileMock.mockRejectedValue(new Error("ENOENT"));

    const error = await analyzeScreenshots("/old.png", "/new.png").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AiAnalysisError);
    expect((error as Error).message).toContain("Не удалось прочитать скриншот");
  });

  it("throws a clear error on 404 and lists available models", async () => {
    const { analyzeScreenshots, GEMINI_API_BASE, AiAnalysisError } =
      await loadAnalyzer({
        GEMINI_API_BASE: "https://gem.test/v1beta",
        GEMINI_MODEL: "gemini-3-flash",
      });
    fetchMock.mockImplementation(async (input) =>
      String(input).includes("/models?")
        ? geminiResponse({ models: [{ name: "models/gemini-real" }] })
        : geminiResponse({ error: { code: 404, message: "not found" } }, 404),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      AiAnalysisError,
    );
    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      /404/,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://gem.test/v1beta/models/gemini-3-flash:generateContent",
      expect.any(Object),
    );
    expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
      `${GEMINI_API_BASE}/models?key=key-1`,
    );
    expect(console.error).toHaveBeenCalledWith(
      "Available Models:",
      JSON.stringify(["gemini-real"]),
    );
  });

  it("wraps transport errors", async () => {
    const { analyzeScreenshots, AiAnalysisError } = await loadAnalyzer();
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const error = await analyzeScreenshots("/old.png", "/new.png").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AiAnalysisError);
    expect((error as Error).message).toBe(
      "Vision API недоступен: getaddrinfo ENOTFOUND",
    );
  });

  it("retries on AbortError and then succeeds", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    const abortError = new DOMException("Timeout", "AbortError");
    fetchMock
      .mockRejectedValueOnce(abortError)
      .mockResolvedValue(geminiResponse(candidate(JSON.stringify(VERDICT))));

    await expect(analyzeScreenshots("/old.png", "/new.png")).resolves.toEqual(
      VERDICT,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after repeated AbortErrors", async () => {
    const { analyzeScreenshots, AiAnalysisError } = await loadAnalyzer();
    const abortError = new DOMException("Timeout", "AbortError");
    fetchMock.mockRejectedValue(abortError);

    const error = await analyzeScreenshots("/old.png", "/new.png").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AiAnalysisError);
    expect((error as Error).message).toMatch(/таймаут|timed out/i);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-abort transport errors", async () => {
    const { analyzeScreenshots, AiAnalysisError } = await loadAnalyzer();
    fetchMock.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    const error = await analyzeScreenshots("/old.png", "/new.png").catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(AiAnalysisError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the auth hint for 401/403 and for auth-ish messages", async () => {
    const { analyzeScreenshots, AUTH_ERROR_MESSAGE } = await loadAnalyzer();

    fetchMock.mockResolvedValue(
      geminiResponse({ error: { message: "permission denied" } }, 403),
    );
    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      AUTH_ERROR_MESSAGE,
    );

    fetchMock.mockResolvedValue(
      geminiResponse({ error: { message: "API key not valid" } }, 400),
    );
    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      AUTH_ERROR_MESSAGE,
    );
  });

  it("reports an error carried in a 200 envelope", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    fetchMock.mockResolvedValue(
      geminiResponse({ error: { code: 500, message: "internal" } }, 200),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      "Vision API вернул ошибку 200: internal",
    );
  });

  it("fails when the request was blocked by safety filters", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    fetchMock.mockResolvedValue(
      geminiResponse({ promptFeedback: { blockReason: "SAFETY" } }),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      "Модель отклонила запрос: SAFETY",
    );
  });

  it("fails when an error status comes without a body", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    fetchMock.mockResolvedValue(new Response("", { status: 500 }));

    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      "Vision API вернул ошибку 500 без тела ответа",
    );
  });

  it("fails when an error status comes with an unparseable body", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    fetchMock.mockResolvedValue(
      new Response("<html>oops</html>", { status: 502 }),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).rejects.toThrow(
      "Vision API вернул ошибку 502: <html>oops</html>",
    );
  });

  it("unwraps a markdown fenced verdict", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    fetchMock.mockResolvedValue(
      geminiResponse(
        candidate(
          `Вот ответ:\n\`\`\`json\n${JSON.stringify(VERDICT)}\n\`\`\`\nготово`,
        ),
      ),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).resolves.toEqual(
      VERDICT,
    );
  });

  it("joins multi-part answers and ignores control characters", async () => {
    const { analyzeScreenshots } = await loadAnalyzer();
    const json = JSON.stringify(VERDICT);
    fetchMock.mockResolvedValue(
      geminiResponse({
        candidates: [
          {
            content: {
              parts: [
                { text: `\u0000${json.slice(0, 10)}` },
                { text: json.slice(10) },
                {},
              ],
            },
          },
        ],
      }),
    );

    await expect(analyzeScreenshots("/old.png", "/new.png")).resolves.toEqual(
      VERDICT,
    );
  });

  it.each([
    ["an empty body on a 200", new Response("", { status: 200 })],
    [
      "an unparseable envelope on a 200",
      new Response("not json at all", { status: 200 }),
    ],
    ["no candidates", geminiResponse({ candidates: [] })],
    ["an empty text part", geminiResponse(candidate("   "))],
    ["a non-JSON verdict", geminiResponse(candidate("всё поменялось"))],
    [
      "a verdict violating the schema",
      geminiResponse(
        candidate(
          JSON.stringify({ ...VERDICT, urgency: "critical", changes: [] }),
        ),
      ),
    ],
  ])(
    "throws an AiAnalysisError for %s",
    async (_case: string, response: Response) => {
      const { analyzeScreenshots, AiAnalysisError } = await loadAnalyzer();
      fetchMock.mockResolvedValue(response);

      await expect(
        analyzeScreenshots("/old.png", "/new.png"),
      ).rejects.toBeInstanceOf(AiAnalysisError);
    },
  );
});
