# Competitor Watchdog

B2B Micro-SaaS для мониторинга изменений на сайтах конкурентов (цены, скидки, промо-баннеры, наличие) с помощью headless-браузера и Vision AI.

## Стек

- Next.js (App Router), TypeScript, Tailwind CSS
- PostgreSQL + Prisma ORM
- Playwright (headless + stealth-маскировка)
- Auth.js (NextAuth v5) + Prisma-адаптер, Credentials-провайдер с bcrypt
- OpenAI Vision (structured JSON output)
- Telegram Bot API для алертов

## Структура

| Модуль                            | Назначение                                                   |
| --------------------------------- | ------------------------------------------------------------ |
| `src/lib/scraper.ts`              | Снятие скриншота страницы или элемента по `cssSelector`      |
| `src/lib/aiAnalyzer.ts`           | Сравнение двух скриншотов, строгий JSON-вердикт              |
| `src/lib/telegram.ts`             | Отправка сообщений через Telegram Bot API                    |
| `src/lib/checkWorker.ts`          | Оркестрация проверок с учётом лимитов тарифа                 |
| `src/app/api/cron/check/route.ts` | Cron-эндпоинт запуска воркера                                |
| `src/app/dashboard`               | Дашборд: список сайтов, форма добавления, история проверок   |
| `src/app/dashboard/feedback`      | Обратная связь: форма отзыва и уведомление админу в Telegram |
| `src/auth.ts`, `src/app/(auth)`   | Авторизация: конфиг Auth.js, страницы `/login` и `/register` |

## Запуск

```bash
npm install
npx playwright install chromium
cp .env.example .env   # заполнить DATABASE_URL, AUTH_SECRET, OPENAI_API_KEY, TELEGRAM_BOT_TOKEN
npx prisma migrate dev
npm run dev
```

Запуск проверок вручную:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check
```

## Тарифы

| Тариф     | Сайтов     | Минимальный интервал | Проверок за 24 ч | Эталонов за 24 ч | Алерты   |
| --------- | ---------- | -------------------- | ---------------- | ---------------- | -------- |
| free      | 2          | 24 ч                 | 2                | 5                | email    |
| premium   | 25         | 1 ч                  | 600              | без лимита       | Telegram |
| unlimited | без лимита | 1 ч                  | без лимита       | без лимита       | Telegram |

Тариф `unlimited` получают пользователи с `role = ADMIN` или `isUnlimited = true`
(`hasUnlimitedAccess` в `src/lib/plans.ts`) — все лимиты для них не применяются.

Лимиты живут в `src/lib/plans.ts`, счётчики — в `src/lib/quota.ts`.
`getUserDailyChecksCount` считает сравнительные проверки за последние 24 часа,
`getUserDailyBaselinesCount` — эталоны по журналу `BaselineEvent` (журнал живёт
отдельно от сайтов, поэтому удаление сайта не обнуляет лимит эталонов). При исчерпании суточного лимита
проверок воркер пропускает сайт с причиной `daily_check_limit`, ручная проверка
`POST /api/sites/[siteId]/check` отвечает 429, а новый сайт создаётся без
немедленного скриншота. При исчерпании лимита эталонов добавление сайта
отклоняется.

Первая проверка сайта сохраняется с флагом `CheckHistory.isBaseline` и
показывается в истории как «Эталонный снимок»; в строке сайта на дашборде видно
время до следующей плановой проверки.

## Скриншоты и дифф

Снимки лежат в `/tmp/screenshots` и отдаются клиенту через
`GET /api/screenshots/[filename]` — роут требует сессию и проверяет, что файл
принадлежит проверке сайта этого пользователя. В истории вместо путей выводятся
миниатюры, клик открывает полноразмерное изображение (закрытие по клику вне окна
или по кнопке «Закрыть»).

Для повторных проверок `createDiffImage` (`pixelmatch` + `pngjs`) сохраняет PNG
с подсветкой различий в `CheckHistory.diffImageUrl`, доля изменившихся пикселей —
в `diffRatio`. Если ИИ не нашёл изменений, показывается бейдж «Изменений не
обнаружено», текущий снимок при этом остаётся доступен.

## Админ-панель

Пользователь с `role = ADMIN` видит в навигации ссылку «Админ-панель» и страницу
`/admin` со списком аккаунтов: тариф, количество сайтов, дата регистрации,
переключатель безлимита и удаление аккаунта (каскадно удаляет сайты, проверки и
эталоны). API: `GET /api/admin/users`, `PATCH|DELETE /api/admin/users/[id]`
(доступ проверяется `requireAdmin` в `src/lib/admin.ts`: 401 без сессии, 403 без
роли). Выдать первого администратора можно вручную:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'you@example.com';
```
