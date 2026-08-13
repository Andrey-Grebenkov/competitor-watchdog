import Link from "next/link";
import { redirect } from "next/navigation";
import { signOutUser } from "@/app/(auth)/actions";
import { getCurrentUser } from "@/lib/currentUser";
import { formatDateTime } from "@/lib/format";
import { planLabel, planNameFor } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import {
  badge,
  card,
  ghostButton,
  mutedText,
  subtleText,
  tableBodyRow,
  tableCell,
  tableHeadCell,
  tableHeadRow,
} from "@/lib/ui";
import { UserRowActions } from "./UserRowActions";

export const dynamic = "force-dynamic";

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
          <p className={mutedText}>
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
            <tr className={tableHeadRow}>
              <th className={tableHeadCell}>Пользователь</th>
              <th className={tableHeadCell}>Роль</th>
              <th className={tableHeadCell}>Тариф</th>
              <th className={tableHeadCell}>Сайтов</th>
              <th className={tableHeadCell}>Регистрация</th>
              <th className={tableHeadCell}>Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className={tableBodyRow}>
                <td className={tableCell}>
                  <div className="font-medium">{user.email}</div>
                  {user.id === admin.id ? (
                    <div className={subtleText}>это вы</div>
                  ) : null}
                </td>
                <td className={tableCell}>
                  <span
                    className={
                      user.role === "ADMIN" ? badge.accent : badge.neutral
                    }
                  >
                    {user.role === "ADMIN" ? "админ" : "пользователь"}
                  </span>
                </td>
                <td className={tableCell}>
                  <span
                    className={user.isUnlimited ? badge.success : badge.neutral}
                  >
                    {planLabel(planNameFor(user))}
                  </span>
                </td>
                <td className={tableCell}>{user._count.sites}</td>
                <td className={tableCell}>{formatDateTime(user.createdAt)}</td>
                <td className={tableCell}>
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
