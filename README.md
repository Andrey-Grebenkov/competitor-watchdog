# Competitor Watchdog

B2B Micro-SaaS для мониторинга изменений на сайтах конкурентов (цены, скидки, промо-баннеры, наличие) с помощью headless-браузера и Vision AI.

## Стек

- Next.js (App Router), TypeScript, Tailwind CSS
- PostgreSQL + Prisma ORM
- Playwright (headless + stealth-маскировка)
- Auth.js (NextAuth v5) + Prisma-адаптер, Credentials-провайдер с bcrypt
- Google Gemini Vision (REST `generateContent`, JSON-ответ по схеме)
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
cp .env.example .env   # заполнить DATABASE_URL, AUTH_SECRET, GEMINI_API_KEY, TELEGRAM_BOT_TOKEN
npx prisma migrate dev
npm run dev
```

Запуск проверок вручную:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check
```

## Безопасность

- `CRON_SECRET` обязателен: без него `GET /api/cron/check` отвечает 401 в любом
  окружении, заголовок сравнивается в постоянное время.
- URL сайтов проходят `assertPublicUrl` (`src/lib/urlGuard.ts`): только http(s),
  запрещены loopback, приватные и link-local адреса (включая
  `169.254.169.254`) и служебные домены. Скрапер дополнительно блокирует
  редиректы навигации на такие адреса.
- Вход, регистрация и форма отзыва ограничены по частоте
  (`src/lib/rateLimit.ts`, окно в памяти процесса).
- Ответные заголовки безопасности задаются в `next.config.ts`.

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

## Vision-модель

`src/lib/aiAnalyzer.ts` вызывает Gemini напрямую через `fetch`:
`POST {GEMINI_API_BASE}/models/{GEMINI_MODEL}:generateContent` с ключом в заголовке
`x-goog-api-key`, скриншоты передаются как `inlineData` (base64 PNG), ответ
запрашивается с `generationConfig.responseMimeType = "application/json"` и
`responseSchema`. Затем `JSON.parse` (с отбрасыванием markdown-обёртки) и
`analysisSchema.parse`. Дефолты: `https://generativelanguage.googleapis.com/v1beta`
и `gemini-1.5-flash-latest`; ключ — `GEMINI_API_KEY` или (для совместимости)
`OPENAI_API_KEY`. При 404 модели запрос повторяется по цепочке `GEMINI_MODEL` →
`gemini-1.5-flash-latest` → `gemini-1.5-pro`.
Завершающие слеши в `GEMINI_API_BASE` отбрасываются, из имени модели снимается
префикс `models/`, а `gemini-1.5-flash` дополняется до `gemini-1.5-flash-latest`
(`geminiEndpoint()`), иначе адрес вида `.../v1beta//models/models/...` даёт 404.

Скрапер запускает Chromium с `--disable-http2` (часть сайтов рвёт HTTP/2-потоки —
`ERR_HTTP2_SERVER_REFUSED_STREAM`) и ждёт `domcontentloaded` + 2 с на отрисовку.

Если ответ модели пуст, обёрнут в ```json или не разбирается схемой, сырой текст
логируется как `Gemini Raw Response:`, а проверка завершается успешно с вердиктом
«Не удалось распарсить текстовый ответ от ИИ.» (`UNPARSEABLE_ANALYSIS`) — пайплайн
не ломается. Ошибки самого HTTP-запроса по-прежнему считаются сбоем этапа анализа.

Любая ошибка провайдера логируется как `Vision API Error Details:` и приходит в UI
текстом: при 401/403 или «API key not valid» — «Ошибка авторизации: проверьте
GEMINI_API_KEY…», при 404/500 — «Vision API вернул ошибку <код>: …». HTTP-код
самого `/check` остаётся 200.

## Ошибки проверки

`performSiteCheck` разделяет этапы и возвращает `failedStage`:

- `screenshot` — Playwright не смог открыть страницу или снять снимок. Детали
  логируются как `Playwright Error Details:`, в UI приходит «Ошибка загрузки сайта
  (Playwright): …» (`ScrapeError` из `src/lib/scraper.ts`).
- `analysis` — сбой Vision API (`AiAnalysisError`, лог `Vision API Error Details:`).
- `persist` — сбой записи в БД или отправки алерта.

Сбой скрапинга никогда не подменяется сообщением про Vision API и наоборот.

`POST /api/sites/[siteId]/check` при таком сбое отвечает 200 с
`{ ok: false, failedStage, error }` — 502 больше не возвращается, UI показывает
текст ошибки под кнопкой «Проверить сейчас».

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
