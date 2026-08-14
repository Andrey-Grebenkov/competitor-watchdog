"use server";

import type { WatchedSite } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { performSiteCheck } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { formString } from "@/lib/input";
import { prisma } from "@/lib/prisma";
import { baselineLimitMessage, getUserQuota } from "@/lib/quota";
import { assertPublicUrl, BlockedUrlError } from "@/lib/urlGuard";

const MAX_NAME_LENGTH = 120;
const MAX_SELECTOR_LENGTH = 300;

export interface AddSiteValues {
  name: string;
  url: string;
  cssSelector: string;
  checkIntervalHours: string;
}

export interface AddSiteState {
  error?: string;
  success?: boolean;
  /** Сайт создан, но первая проверка отложена — что сообщить пользователю. */
  notice?: string;
  /** Введённые значения, чтобы форма не терялась при ошибке. */
  values?: AddSiteValues;
}

/**
 * Нормализует URL и заодно отсекает адреса внутренней сети (SSRF).
 * Возвращает текст ошибки вместо URL, если адрес недопустим.
 */
async function normalizeUrl(
  raw: string,
): Promise<{ url: string } | { error: string }> {
  try {
    return { url: (await assertPublicUrl(raw)).toString() };
  } catch (error) {
    return {
      error:
        error instanceof BlockedUrlError
          ? error.message
          : "Укажите корректный http(s) URL",
    };
  }
}

export async function addSite(
  _prevState: AddSiteState,
  formData: FormData,
): Promise<AddSiteState> {
  const name = formString(formData, "name");
  const rawUrl = formString(formData, "url");
  const cssSelector = formString(formData, "cssSelector");
  const rawInterval = formString(formData, "checkIntervalHours", {
    fallback: "24",
  });
  const values: AddSiteValues = {
    name,
    url: rawUrl,
    cssSelector,
    checkIntervalHours: rawInterval,
  };

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Нет активного пользователя", values };
  }

  const checkIntervalHours = Number(rawInterval);

  if (!name) {
    return { error: "Укажите название сайта", values };
  }
  if (name.length > MAX_NAME_LENGTH) {
    return {
      error: `Название не должно превышать ${MAX_NAME_LENGTH} символов`,
      values,
    };
  }
  if (cssSelector.length > MAX_SELECTOR_LENGTH) {
    return {
      error: `Селектор не должен превышать ${MAX_SELECTOR_LENGTH} символов`,
      values,
    };
  }

  if (!Number.isInteger(checkIntervalHours) || checkIntervalHours < 1) {
    return {
      error: "Интервал должен быть целым числом часов (минимум 1)",
      values,
    };
  }

  const normalized = await normalizeUrl(rawUrl);
  if ("error" in normalized) {
    return { error: normalized.error, values };
  }
  const url = normalized.url;

  const quota = await getUserQuota(user);
  if (quota.sitesExhausted) {
    return {
      error: `Достигнут лимит тарифа: ${quota.limits.maxSites} сайтов`,
      values,
    };
  }
  if (quota.dailyBaselinesExhausted) {
    return { error: baselineLimitMessage(quota), values };
  }

  let site: WatchedSite;
  try {
    site = await prisma.watchedSite.create({
      data: {
        userId: user.id,
        name,
        url,
        cssSelector: cssSelector || null,
        checkIntervalHours: Math.max(
          checkIntervalHours,
          quota.limits.minIntervalHours,
        ),
      },
    });
  } catch (error) {
    console.error("Add Site Error Details:", error);
    return { error: "Не удалось сохранить сайт, попробуйте ещё раз", values };
  }

  revalidatePath("/dashboard");

  if (quota.dailyChecksExhausted) {
    return {
      success: true,
      notice: `Сайт добавлен, но суточный лимит проверок (${quota.checksUsed}/${quota.limits.maxDailyChecks}) на сегодня исчерпан. Следующая проверка пройдёт по расписанию завтра`,
    };
  }

  const result = await performSiteCheck({ ...site, user });
  revalidatePath("/dashboard");

  if (result.status === "failed") {
    return {
      success: true,
      notice: `Сайт добавлен, но эталонный снимок не удалось сделать. ${result.error ?? "Неизвестная ошибка"}`,
    };
  }

  return { success: true };
}

/**
 * Переключает паузу проверок. Нет сессии — ведёт на логин, нет сайта — 404:
 * молчаливый выход выглядел бы как неработающая кнопка.
 */
export async function toggleSite(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const siteId = formString(formData, "siteId");
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
  });
  if (!site) {
    notFound();
  }

  await prisma.watchedSite.update({
    where: { id: site.id },
    data: { isActive: !site.isActive },
  });

  revalidatePath("/dashboard");
}
