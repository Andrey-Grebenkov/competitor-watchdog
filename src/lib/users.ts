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
