import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutUser } from "@/app/(auth)/actions";
import { PLAN_LIMITS, type PlanName } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { badge, card, ghostButton, ghostButtonWarning } from "@/lib/ui";
import { AddSiteForm } from "./AddSiteForm";
import { DeleteSiteButton } from "./DeleteSiteButton";
import { toggleSite } from "./actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const planName: PlanName =
    user.subscriptionStatus === "premium" ? "premium" : "free";
  const plan = PLAN_LIMITS[planName];

  const sites = await prisma.watchedSite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      history: { orderBy: { checkedAt: "desc" }, take: 1 },
      _count: { select: { history: true } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Отслеживаемые сайты</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {user.email} · тариф {planName} · {sites.length}/{plan.maxSites}{" "}
            сайтов · минимальный интервал {plan.minIntervalHours} ч
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/dashboard/feedback" className={ghostButton}>
            Обратная связь
          </Link>
          <Link href="/" className={ghostButton}>
            На главную
          </Link>
          <form action={signOutUser}>
            <button type="submit" className={ghostButton}>
              Выйти
            </button>
          </form>
        </nav>
      </header>

      <section className="mt-8">
        <AddSiteForm />
      </section>

      <section className={`mt-10 overflow-x-auto p-1 ${card}`}>
        {sites.length === 0 ? (
          <p className="px-4 py-6 text-sm text-black/60 dark:text-white/60">
            Пока нет сайтов для отслеживания.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-slate-500 dark:border-white/15 dark:text-slate-400">
                <th className="px-4 py-3 font-medium">Сайт</th>
                <th className="px-4 py-3 font-medium">Статус</th>
                <th className="px-4 py-3 font-medium">Интервал</th>
                <th className="px-4 py-3 font-medium">Последняя проверка</th>
                <th className="px-4 py-3 font-medium">Проверок</th>
                <th className="px-4 py-3 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const lastCheck = site.history[0];
                return (
                  <tr
                    key={site.id}
                    className="border-b border-black/5 transition last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{site.name}</div>
                      <div className="text-xs break-all text-black/50 dark:text-white/50">
                        {site.url}
                        {site.cssSelector ? ` · ${site.cssSelector}` : ""}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          site.isActive ? badge.success : badge.neutral
                        }
                      >
                        {site.isActive ? "активен" : "на паузе"}
                      </span>
                    </td>
                    <td className="px-4 py-3">{site.checkIntervalHours} ч</td>
                    <td className="px-4 py-3">
                      {lastCheck
                        ? dateFormatter.format(lastCheck.checkedAt)
                        : "—"}
                    </td>
                    <td className="px-4 py-3">{site._count.history}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Link
                          href={`/dashboard/sites/${site.id}`}
                          className={ghostButton}
                        >
                          История
                        </Link>
                        <form action={toggleSite}>
                          <input type="hidden" name="siteId" value={site.id} />
                          <button type="submit" className={ghostButtonWarning}>
                            {site.isActive ? "Пауза" : "Включить"}
                          </button>
                        </form>
                        <DeleteSiteButton
                          siteId={site.id}
                          siteName={site.name}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
