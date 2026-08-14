import { readFile } from "node:fs/promises";
import path from "node:path";
import { jsonError, requireUser } from "@/lib/apiAuth";
import { isFsErrorCode } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { SCREENSHOT_DIR } from "@/lib/scraper";

const FILENAME_PATTERN = /^[a-zA-Z0-9-]+\.png$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { user, response } = await requireUser();
  if (response) {
    return response;
  }

  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return jsonError("Некорректное имя файла", 400);
  }

  const filePath = path.join(SCREENSHOT_DIR, filename);
  const owned = await prisma.checkHistory.findFirst({
    where: {
      site: { userId: user.id },
      OR: [{ screenshotUrl: filePath }, { diffImageUrl: filePath }],
    },
    select: { id: true },
  });
  if (!owned) {
    return jsonError("Снимок не найден", 404);
  }

  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch (error) {
    // Снимки живут в /tmp и могут быть вычищены — это 404, а остальное
    // (права, сбой диска) — ошибка сервера, которую нельзя глушить.
    if (isFsErrorCode(error, "ENOENT")) {
      return jsonError("Файл недоступен", 404);
    }
    console.error("Screenshot Read Error Details:", filePath, error);
    return jsonError("Не удалось прочитать снимок", 500);
  }

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
