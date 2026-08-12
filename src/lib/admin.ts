import type { User } from "@prisma/client";
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
  const user = await getCurrentUser();
  if (!user) {
    return {
      response: Response.json({ error: "Не авторизован" }, { status: 401 }),
    };
  }
  if (!isAdmin(user)) {
    return {
      response: Response.json({ error: "Доступ запрещён" }, { status: 403 }),
    };
  }
  return { admin: user };
}
