/** Базовый класс доменных ошибок: пробрасывает `cause` и фиксирует `name`. */
export class AppError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Сообщение для пользователя: ожидаемые доменные ошибки уже человекочитаемы,
 * остальные дополняются префиксом этапа.
 */
export function describeError<E extends Error>(
  error: unknown,
  expected: new (...args: never[]) => E,
  fallbackPrefix: string,
): string {
  return error instanceof expected
    ? error.message
    : `${fallbackPrefix}: ${errorMessage(error)}`;
}
