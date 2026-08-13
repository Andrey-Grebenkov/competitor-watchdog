import type { User } from "@prisma/client";
import { getCurrentUser } from "@/lib/currentUser";

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** Успешная авторизация либо готовый ответ с ошибкой доступа. */
export type Authorized =
  | { user: User; response?: undefined }
  | { user?: undefined; response: Response };

/** Проверка авторизации для API-роутов: возвращает готовый ответ 401. */
export async function requireUser(): Promise<Authorized> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: jsonError("Не авторизован", 401) };
  }
  return { user };
}
