import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { badge, card, ghostButton, mutedText, primaryButton } from "@/lib/ui";

export const dynamic = "force-dynamic";

const features = [
  {
    title: "Скрытный мониторинг",
    description:
      "Playwright в headless-режиме со stealth-маскировкой обходит защиту и снимает страницу целиком или по CSS-селектору.",
  },
  {
    title: "Vision AI сравнение",
    description:
      "Мультимодальная модель сравнивает предыдущий и текущий скриншоты и возвращает структурированный список изменений цен, скидок и промо.",
  },
  {
    title: "Мгновенные алерты",
    description:
      "Критичные изменения приходят в Telegram-бот с кратким вердиктом ИИ и историей визуальных снимков.",
  },
];

const plans = [
  {
    name: "Free",
    price: "$0",
    items: ["До 2 сайтов", "Проверка раз в 24 часа", "Уведомления на email"],
  },
  {
    name: "Premium",
    price: "$9–19 / мес",
    items: [
      "До 25 сайтов",
      "Интервал проверок от 1 часа",
      "Мгновенные алерты в Telegram",
    ],
  },
];

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-16 px-6 py-20">
      <section className="flex flex-col items-start gap-6">
        <span className={badge.accent}>B2B Micro-SaaS</span>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Competitor Watchdog
        </h1>
        <p className="max-w-2xl text-base text-black/70 dark:text-white/70">
          Автоматический мониторинг сайтов конкурентов: цены, скидки,
          промо-баннеры и наличие товаров. Беспилотный браузер снимает страницы
          по расписанию, а Vision AI объясняет, что именно изменилось.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard" className={`${primaryButton} px-5 py-3`}>
            Перейти в дашборд
          </Link>
          <Link href="/login" className={ghostButton}>
            Войти
          </Link>
          <Link href="/register" className={ghostButton}>
            Регистрация
          </Link>
          <Link href="/dashboard/feedback" className={ghostButton}>
            Обратная связь
          </Link>
          {user?.role === "ADMIN" ? (
            <Link href="/admin" className={ghostButton}>
              Админ-панель
            </Link>
          ) : null}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        {features.map((feature) => (
          <div
            key={feature.title}
            className={`p-5 transition hover:shadow-md ${card}`}
          >
            <h2 className="font-medium">{feature.title}</h2>
            <p className={`mt-2 ${mutedText}`}>{feature.description}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 sm:grid-cols-2">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`p-6 transition hover:shadow-md ${card}`}
          >
            <h2 className="text-lg font-medium">{plan.name}</h2>
            <p className="mt-1 text-2xl font-semibold">{plan.price}</p>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-black/70 dark:text-white/70">
              {plan.items.map((item) => (
                <li key={item}>— {item}</li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </main>
  );
}
