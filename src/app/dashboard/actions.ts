"use server";

import { revalidatePath } from "next/cache";
import { PLAN_LIMITS, type PlanName } from "@/lib/checkWorker";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/prisma";

export interface AddSiteState {
  error?: string;
  success?: boolean;
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
  const user = await getCurrentUser();
  if (!user) {
    return { error: "Нет активного пользователя" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const url = normalizeUrl(String(formData.get("url") ?? "").trim());
  const cssSelector = String(formData.get("cssSelector") ?? "").trim();
  const checkIntervalHours = Number(formData.get("checkIntervalHours") ?? 24);

  if (!name) {
    return { error: "Укажите название сайта" };
  }
  if (!url) {
    return { error: "Укажите корректный http(s) URL" };
  }
  if (!Number.isInteger(checkIntervalHours) || checkIntervalHours < 1) {
    return { error: "Интервал должен быть целым числом часов (минимум 1)" };
  }

  const plan =
    PLAN_LIMITS[(user.subscriptionStatus as PlanName) in PLAN_LIMITS
      ? (user.subscriptionStatus as PlanName)
      : "free"];

  const existingCount = await prisma.watchedSite.count({
    where: { userId: user.id },
  });
  if (existingCount >= plan.maxSites) {
    return {
      error: `Достигнут лимит тарифа: ${plan.maxSites} сайтов`,
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
