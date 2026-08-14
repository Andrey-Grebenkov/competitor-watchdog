import type { User } from "@prisma/client";
import { planLabel, planNameFor } from "@/lib/plans";

/** Публичное представление пользователя для админских API-ответов. */
export function serializeUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isUnlimited: user.isUnlimited,
    subscriptionStatus: user.subscriptionStatus,
    plan: planLabel(planNameFor(user)),
  };
}

/** Возвращает инициалы пользователя для аватарки. */
export function getUserInitials(
  name: string | null | undefined,
  email: string,
): string {
  const trimmed = name?.trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/);
    if (parts.length > 1) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}
