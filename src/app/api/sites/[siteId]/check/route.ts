import { revalidatePath } from "next/cache";
import { jsonError, requireUser } from "@/lib/apiAuth";
import { performSiteCheck } from "@/lib/checkWorker";
import { prisma } from "@/lib/prisma";
import { dailyLimitMessage, getUserQuota } from "@/lib/quota";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { user, response } = await requireUser();
  if (response) {
    return response;
  }

  const { siteId } = await params;
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
  });
  if (!site) {
    return jsonError("Сайт не найден", 404);
  }

  const quota = await getUserQuota(user);
  if (quota.dailyChecksExhausted) {
    return jsonError(dailyLimitMessage(quota), 429);
  }

  const result = await performSiteCheck({ ...site, user });
  revalidatePath("/dashboard");

  if (result.status === "failed") {
    // Сообщения этапов скрапинга и анализа уже человекочитаемы и не смешиваются.
    const error =
      result.failedStage === "persist" || !result.error
        ? `Проверка не удалась: ${result.error ?? "неизвестная ошибка"}`
        : result.error;
    // Сбой скрапинга или модели — ожидаемый результат, а не ошибка транспорта: отвечаем 200.
    return Response.json({
      ok: false,
      status: result.status,
      failedStage: result.failedStage,
      error,
    });
  }

  return Response.json({
    ok: true,
    status: result.status,
    skipReason: result.skipReason,
    summary: result.analysis?.summary,
    hasChanges: result.analysis?.hasChanges ?? false,
  });
}
