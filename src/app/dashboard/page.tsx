import Link from "next/link";
import { redirect } from "next/navigation";
import { nextCheckLabel } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import {
  badge,
  card,
  ghostButton,
  ghostButtonWarning,
  mutedText,
  subtleText,
  tableBodyRow,
  tableCell,
  tableHeadCell,
  tableHeadRow,
} from "@/lib/ui";
import { AddSiteForm } from "./AddSiteForm";
import { CheckNowButton } from "./CheckNowButton";
import { DeleteSiteButton } from "./DeleteSiteButton";
import { toggleSite } from "./actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const now = new Date();

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
      <header>
        <h1 className="text-2xl font-semibold">Отслеживаемые сайты</h1>
      </header>

      <section className="mt-8">
        <AddSiteForm />
      </section>

      <section className={`mt-10 overflow-x-auto p-1 ${card}`}>
        {sites.length === 0 ? (
          <p className={`px-4 py-6 ${mutedText}`}>
            Пока нет сайтов для отслеживания.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className={tableHeadRow}>
                <th className={tableHeadCell}>Сайт</th>
                <th className={tableHeadCell}>Статус</th>
                <th className={tableHeadCell}>Интервал</th>
                <th className={tableHeadCell}>Последняя проверка</th>
                <th className={tableHeadCell}>Проверок</th>
                <th className={tableHeadCell}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const lastCheck = site.history[0];
                return (
                  <tr key={site.id} className={tableBodyRow}>
                    <td className={tableCell}>
                      <div className="font-medium">{site.name}</div>
                      <div className={`break-all ${subtleText}`}>
                        {site.url}
                        {site.cssSelector ? ` · ${site.cssSelector}` : ""}
                      </div>
                    </td>
                    <td className={tableCell}>
                      <span
                        className={
                          site.isActive ? badge.success : badge.neutral
                        }
                      >
                        {site.isActive ? "активен" : "на паузе"}
                      </span>
                    </td>
                    <td className={tableCell}>{site.checkIntervalHours} ч</td>
                    <td className={tableCell}>
                      <div>
                        {lastCheck ? formatDateTime(lastCheck.checkedAt) : "—"}
                      </div>
                      <div className={subtleText}>
                        {nextCheckLabel(site, user, lastCheck?.checkedAt, now)}
                      </div>
                    </td>
                    <td className={tableCell}>{site._count.history}</td>
                    <td className={tableCell}>
                      <div className="flex flex-wrap items-start gap-1">
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
                        <CheckNowButton siteId={site.id} />
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
