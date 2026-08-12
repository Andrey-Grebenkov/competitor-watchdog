"use server";

import { revalidatePath } from "next/cache";
import { PLAN_LIMITS, type PlanName } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export interface AddSiteValues {
  name: string;
  url: string;
  cssSelector: string;
  checkIntervalHours: string;
}

export interface AddSiteState {
  error?: string;
  success?: boolean;
  /** Введённые значения, чтобы форма не терялась при ошибке. */
  values?: AddSiteValues;
}

function normalizeUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function addSite(
  _prevState: AddSiteState,
  formData: FormData,
): Promise<AddSiteState> {
  const name = String(formData.get("name") ?? "").trim();
  const rawUrl = String(formData.get("url") ?? "").trim();
  const cssSelector = String(formData.get("cssSelector") ?? "").trim();
  const rawInterval = String(formData.get("checkIntervalHours") ?? "24").trim();
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

  const url = normalizeUrl(rawUrl);
  const checkIntervalHours = Number(rawInterval);

  if (!name) {
    return { error: "Укажите название сайта", values };
  }
  if (!url) {
    return { error: "Укажите корректный http(s) URL", values };
  }
  if (!Number.isInteger(checkIntervalHours) || checkIntervalHours < 1) {
    return {
      error: "Интервал должен быть целым числом часов (минимум 1)",
      values,
    };
  }

  const plan =
    PLAN_LIMITS[
      (user.subscriptionStatus as PlanName) in PLAN_LIMITS
        ? (user.subscriptionStatus as PlanName)
        : "free"
    ];

  const existingCount = await prisma.watchedSite.count({
    where: { userId: user.id },
  });
  if (existingCount >= plan.maxSites) {
    return {
      error: `Достигнут лимит тарифа: ${plan.maxSites} сайтов`,
      values,
    };
  }

  await prisma.watchedSite.create({
    data: {
      userId: user.id,
      name,
      url,
      cssSelector: cssSelector || null,
      checkIntervalHours: Math.max(checkIntervalHours, plan.minIntervalHours),
    },
  });

  revalidatePath("/dashboard");
  return { success: true };
}

export async function toggleSite(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) {
    return;
  }

  const siteId = String(formData.get("siteId") ?? "");
  const site = await prisma.watchedSite.findFirst({
    where: { id: siteId, userId: user.id },
  });
  if (!site) {
    return;
  }

  await prisma.watchedSite.update({
    where: { id: site.id },
    data: { isActive: !site.isActive },
  });

  revalidatePath("/dashboard");
}
