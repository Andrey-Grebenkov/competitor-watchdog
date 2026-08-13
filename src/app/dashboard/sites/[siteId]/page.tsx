import path from "node:path";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { badge, card, ghostButton, mutedText, subtleText } from "@/lib/ui";
import { ScreenshotGallery, type ScreenshotItem } from "./ScreenshotGallery";

export const dynamic = "force-dynamic";

function screenshotSrc(filePath: string): string {
  return `/api/screenshots/${encodeURIComponent(path.basename(filePath))}`;
}

export default async function SiteHistoryPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
    include: { history: { orderBy: { checkedAt: "desc" } } },
  });

  if (!site) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{site.name}</h1>
          <p className={`break-all ${subtleText}`}>{site.url}</p>
        </div>
        <Link href="/dashboard" className={ghostButton}>
          К списку сайтов
        </Link>
      </header>

      <section className="mt-8 flex flex-col gap-4">
        {site.history.length === 0 ? (
          <p className={mutedText}>Проверок пока не было.</p>
        ) : (
          site.history.map((check) => {
            const items: ScreenshotItem[] = [
              {
                src: screenshotSrc(check.screenshotUrl),
                label: check.isBaseline
                  ? "Эталонный снимок"
                  : "Текущее состояние",
              },
            ];
            if (check.diffImageUrl) {
              items.push({
                src: screenshotSrc(check.diffImageUrl),
                label: "Подсветка различий",
              });
            }

            return (
              <article key={check.id} className={`p-4 ${card}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {check.isBaseline ? (
                    <span className={badge.accent}>Эталонный снимок</span>
                  ) : (
                    <span
                      className={
                        check.isAlertTriggered ? badge.alert : badge.success
                      }
                    >
                      {check.isAlertTriggered
                        ? "есть изменения"
                        : "Изменений не обнаружено"}
                    </span>
                  )}
                  <time className={subtleText}>
                    {formatDateTime(check.checkedAt)}
                  </time>
                </div>

                <ScreenshotGallery items={items} />

                {check.diffRatio !== null && !check.isBaseline ? (
                  <p className={`mt-2 ${subtleText}`}>
                    Изменилось пикселей: {(check.diffRatio * 100).toFixed(2)}%
                  </p>
                ) : null}

                <p className="mt-3 text-sm">
                  {check.aiSummary ??
                    (check.isBaseline
                      ? "Эталонный снимок — точка отсчёта для будущих сравнений."
                      : "Вердикт ИИ отсутствует.")}
                </p>
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
