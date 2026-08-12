import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutUser } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/currentUser";
import { planLabel, planNameFor } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { badge, card, ghostButton } from "@/lib/ui";
import { UserRowActions } from "./UserRowActions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "UTC",
});

export default async function AdminPage() {
  const admin = await getCurrentUser();
  if (!admin) {
    redirect("/login");
  }
  if (admin.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { sites: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Админ-панель</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {admin.email} · Пользователей: {users.length}
          </p>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/dashboard" className={ghostButton}>
            К дашборду
          </Link>
          <form action={signOutUser}>
            <button type="submit" className={ghostButton}>
              Выйти
            </button>
          </form>
        </nav>
      </header>

      <section className={`mt-8 overflow-x-auto p-1 ${card}`}>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-black/10 text-left text-slate-500 dark:border-white/15 dark:text-slate-400">
              <th className="px-4 py-3 font-medium">Пользователь</th>
              <th className="px-4 py-3 font-medium">Роль</th>
              <th className="px-4 py-3 font-medium">Тариф</th>
              <th className="px-4 py-3 font-medium">Сайтов</th>
              <th className="px-4 py-3 font-medium">Регистрация</th>
              <th className="px-4 py-3 font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b border-black/5 transition last:border-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">{user.email}</div>
                  {user.id === admin.id ? (
                    <div className="text-xs text-black/50 dark:text-white/50">
                      это вы
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      user.role === "ADMIN" ? badge.accent : badge.neutral
                    }
                  >
                    {user.role === "ADMIN" ? "админ" : "пользователь"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={user.isUnlimited ? badge.success : badge.neutral}
                  >
                    {planLabel(planNameFor(user))}
                  </span>
                </td>
                <td className="px-4 py-3">{user._count.sites}</td>
                <td className="px-4 py-3">
                  {dateFormatter.format(user.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <UserRowActions
                    userId={user.id}
                    email={user.email}
                    isUnlimited={user.isUnlimited}
                    isSelf={user.id === admin.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
