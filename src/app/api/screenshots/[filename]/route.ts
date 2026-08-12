import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { SCREENSHOT_DIR } from "@/lib/scraper";

const FILENAME_PATTERN = /^[a-zA-Z0-9-]+\.png$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { filename } = await params;
  if (!FILENAME_PATTERN.test(filename)) {
    return Response.json({ error: "Некорректное имя файла" }, { status: 400 });
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
    return Response.json({ error: "Снимок не найден" }, { status: 404 });
  }

  let file: Buffer;
  try {
    file = await readFile(filePath);
  } catch {
    return Response.json({ error: "Файл недоступен" }, { status: 404 });
  }

  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
