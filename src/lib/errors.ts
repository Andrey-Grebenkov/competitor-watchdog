/** Текст ошибки для логов и сообщений пользователю. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Ошибка файловой системы с указанным кодом (`ENOENT`, `EACCES`, …). */
export function isFsErrorCode(error: unknown, code: string): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return error.code === code;
}
