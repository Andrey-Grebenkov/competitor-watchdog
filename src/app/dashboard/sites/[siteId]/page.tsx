import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function SiteHistoryPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const user = await getCurrentUser();
  if (!user) {
    notFound();
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
          <p className="text-xs break-all text-black/50 dark:text-white/50">
            {site.url}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm underline underline-offset-4">
          К списку сайтов
        </Link>
      </header>

      <section className="mt-8 flex flex-col gap-4">
        {site.history.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Проверок пока не было.
          </p>
        ) : (
          site.history.map((check) => (
            <article
              key={check.id}
              className="rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={
                    check.isAlertTriggered
                      ? "rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800"
                      : "rounded-full bg-neutral-200 px-2 py-1 text-xs font-medium text-neutral-700"
                  }
                >
                  {check.isAlertTriggered ? "есть изменения" : "без изменений"}
                </span>
                <time className="text-xs text-black/50 dark:text-white/50">
                  {dateFormatter.format(check.checkedAt)}
                </time>
              </div>

              <p className="mt-3 text-sm">
                {check.aiSummary ?? "Вердикт ИИ отсутствует (базовый снимок)."}
              </p>

              <p className="mt-2 text-xs break-all text-black/40 dark:text-white/40">
                {check.screenshotUrl}
              </p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
