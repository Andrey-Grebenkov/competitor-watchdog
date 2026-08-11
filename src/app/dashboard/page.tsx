import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutUser } from "@/app/(auth)/actions";
import { PLAN_LIMITS, type PlanName } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";
import { AddSiteForm } from "./AddSiteForm";
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
        <div className="flex items-center gap-4 text-sm">
          <Link href="/" className="underline underline-offset-4">
            На главную
          </Link>
          <form action={signOutUser}>
            <button type="submit" className="underline underline-offset-4">
              Выйти
            </button>
          </form>
        </div>
      </header>

      <section className="mt-8">
        <AddSiteForm />
      </section>

      <section className="mt-10 overflow-x-auto">
        {sites.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            Пока нет сайтов для отслеживания.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left dark:border-white/15">
                <th className="py-2 pr-4 font-medium">Сайт</th>
                <th className="py-2 pr-4 font-medium">Статус</th>
                <th className="py-2 pr-4 font-medium">Интервал</th>
                <th className="py-2 pr-4 font-medium">Последняя проверка</th>
                <th className="py-2 pr-4 font-medium">Проверок</th>
                <th className="py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const lastCheck = site.history[0];
                return (
                  <tr
                    key={site.id}
                    className="border-b border-black/5 dark:border-white/10"
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium">{site.name}</div>
                      <div className="text-xs break-all text-black/50 dark:text-white/50">
                        {site.url}
                        {site.cssSelector ? ` · ${site.cssSelector}` : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={
                          site.isActive
                            ? "rounded-full bg-green-100 px-2 py-1 text-xs text-green-800"
                            : "rounded-full bg-neutral-200 px-2 py-1 text-xs text-neutral-700"
                        }
                      >
                        {site.isActive ? "активен" : "на паузе"}
                      </span>
                    </td>
                    <td className="py-3 pr-4">{site.checkIntervalHours} ч</td>
                    <td className="py-3 pr-4">
                      {lastCheck
                        ? dateFormatter.format(lastCheck.checkedAt)
                        : "—"}
                    </td>
                    <td className="py-3 pr-4">{site._count.history}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/dashboard/sites/${site.id}`}
                          className="underline underline-offset-4"
                        >
                          История
                        </Link>
                        <form action={toggleSite}>
                          <input type="hidden" name="siteId" value={site.id} />
                          <button
                            type="submit"
                            className="underline underline-offset-4"
                          >
                            {site.isActive ? "Пауза" : "Включить"}
                          </button>
                        </form>
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
