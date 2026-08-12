import { revalidatePath } from "next/cache";
import { performSiteCheck } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { dailyLimitMessage, getUserQuota } from "@/lib/quota";

export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Не авторизован" }, { status: 401 });
  }

  const { siteId } = await params;
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
  });
  if (!site) {
    return Response.json({ error: "Сайт не найден" }, { status: 404 });
  }

  const quota = await getUserQuota(user);
  if (quota.dailyChecksExhausted) {
    return Response.json({ error: dailyLimitMessage(quota) }, { status: 429 });
  }

  const result = await performSiteCheck({ ...site, user });
  revalidatePath("/dashboard");

  if (result.status === "failed") {
    // Сообщения этапов скрапинга и анализа уже человекочитаемы и не смешиваются.
    const error =
      result.failedStage === "persist" || !result.error
        ? `Проверка не удалась: ${result.error ?? "неизвестная ошибка"}`
        : result.error;
    return Response.json(
      { error, failedStage: result.failedStage },
      { status: 502 },
    );
  }

  return Response.json({
    status: result.status,
    skipReason: result.skipReason,
    summary: result.analysis?.summary,
    hasChanges: result.analysis?.hasChanges ?? false,
  });
}
