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

| Модуль | Назначение |
| --- | --- |
| `src/lib/scraper.ts` | Снятие скриншота страницы или элемента по `cssSelector` |
| `src/lib/aiAnalyzer.ts` | Сравнение двух скриншотов, строгий JSON-вердикт |
| `src/lib/telegram.ts` | Отправка сообщений через Telegram Bot API |
| `src/lib/checkWorker.ts` | Оркестрация проверок с учётом лимитов тарифа |
| `src/app/api/cron/check/route.ts` | Cron-эндпоинт запуска воркера |
| `src/app/dashboard` | Дашборд: список сайтов, форма добавления, история проверок |
| `src/app/dashboard/feedback` | Обратная связь: форма отзыва и уведомление админу в Telegram |
| `src/auth.ts`, `src/app/(auth)` | Авторизация: конфиг Auth.js, страницы `/login` и `/register` |

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

| Тариф | Сайтов | Минимальный интервал | Алерты |
| --- | --- | --- | --- |
| free | 2 | 24 ч | email |
| premium | 25 | 1 ч | Telegram |
