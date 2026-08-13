import type { User } from "@prisma/client";
import { jsonError, requireUser } from "@/lib/apiAuth";
import { getCurrentUser } from "@/lib/currentUser";

export function isAdmin(user: User): boolean {
  return user.role === "ADMIN";
}

/** Текущий пользователь, если он администратор, иначе `null`. */
export async function getCurrentAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  return user && isAdmin(user) ? user : null;
}

/**
 * Проверка прав для админских роутов: возвращает готовый ответ 401/403,
 * если доступ запрещён.
 */
export async function requireAdmin(): Promise<
  | { admin: User; response?: undefined }
  | { admin?: undefined; response: Response }
> {
  const authorized = await requireUser();
  if (authorized.response) {
    return { response: authorized.response };
  }
  if (!isAdmin(authorized.user)) {
    return { response: jsonError("Доступ запрещён", 403) };
  }
  return { admin: authorized.user };
}
